import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { streamChat, downloadFile, compressConversation } from '../lib/api';
import { useUIStore } from '../lib/stores';
import { useModels, useSession } from '../hooks/useSession';
import { timeAgo, formatTokens, formatCost, type Message, type ModelInfo } from '../lib/types';
import ModelPicker from '../components/chat/ModelPicker';
import { Markdown, CopyButton } from '../components/Markdown';

interface LocalMsg extends Message {
  streaming?: boolean;
}

export default function Chat() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toggleSidebar } = useUIStore();
  const { data: modelsData } = useModels();
  const { session } = useSession();

  const defaultModel = modelsData?.default_model ?? 'openai/gpt-4o-mini';
  const [model, setModel] = useState(defaultModel);
  useEffect(() => setModel(defaultModel), [defaultModel]);

  // Transparency: today's team usage for the free-quota pill
  const { data: today } = useQuery({
    queryKey: ['usage-today'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_today_usage');
      if (error) throw error;
      return data as { requests: number; tokens_in: number; tokens_out: number; cost: number; errors: number };
    },
    refetchInterval: 30000,
  });

  const [input, setInput] = useState('');
  const [images, setImages] = useState<string[]>([]); // data URLs
  const [fileMeta, setFileMeta] = useState<{ name: string; mime: string; size: number; path?: string }[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const [agentMode, setAgentMode] = useState(false);
  const [safeMode, setSafeMode] = useState(
    () => (typeof window !== 'undefined' && localStorage.getItem('infora-safe-mode')) === '1'
  );
  const [flightPlan, setFlightPlan] = useState<{ text: string; inTok: number; outTok: number; cost: number } | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [toolStatus, setToolStatus] = useState<{ name: string; detail: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);
  const speechSupported =
    typeof window !== "undefined" &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const toggleMic = () => {
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (listening) {
      try { recRef.current?.stop(); } catch {}
      return;
    }
    const rec = new SR();
    rec.lang = "en-IN";
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      setInput((finalText + interim).replace(/\s+/g, " ").trimStart());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  };

  // ---- Load conversation + messages ----
  const { data: conv } = useQuery({
    queryKey: ['conversation', conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', conversationId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // model derived from conversation hint when switching chats (only on conversation change)
  const appliedHintRef = useRef<string | null>(null);
  useEffect(() => {
    if (conversationId && conv?.model_hint && appliedHintRef.current !== conversationId) {
      appliedHintRef.current = conversationId;
      setModel(conv.model_hint);
    }
  }, [conversationId, conv?.model_hint]);

  const { data: allMessages = [] } = useQuery({
    queryKey: ['messages', conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId!)
        .order('created_at', { ascending: true })
        .limit(200);
      if (error) throw error;
      return data as Message[];
    },
  });

  // active branch path (walk from leaf to root)
  const msgMap = useMemo(() => {
    const m = new Map<string, Message>();
    allMessages.forEach((msg) => m.set(msg.id, msg));
    return m;
  }, [allMessages]);

  const [leafId, setLeafId] = useState<string | null>(null);

  const path = useMemo<Message[]>(() => {
    if (!allMessages.length) return [];
    // default leaf: the last message by created_at that is a leaf (no children)
    const childrenOf = new Set(allMessages.map((m) => m.parent_message_id).filter(Boolean));
    let leaf = leafId;
    if (!leaf || !msgMap.has(leaf)) {
      leaf = allMessages
        .filter((m) => !childrenOf.has(m.id))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]?.id ?? null;
    }
    const out: Message[] = [];
    let cur = leaf ? msgMap.get(leaf) : undefined;
    let guard = 0;
    while (cur && guard < 50) {
      guard++;
      out.unshift(cur);
      cur = cur.parent_message_id ? msgMap.get(cur.parent_message_id) : undefined;
    }
    return out;
  }, [allMessages, leafId, msgMap]);

  // local streaming message appended to path
  const [streamMsg, setStreamMsg] = useState<LocalMsg | null>(null);
  const display = streamMsg ? [...path, streamMsg] : path;

  // Transparency: context gauge + budget
  const ctxTokens = useMemo(() => {
    const live = display.filter((m) => !m.compressed);
    const chars = live.reduce((a, m) => a + m.content.length, 0) + ((conv as any)?.summary?.length ?? 0);
    return Math.ceil(chars / 4);
  }, [display, (conv as any)?.summary]);
  const ctxLimit = modelsData?.models.find((m) => m.id === model)?.context_length ?? 0;
  const requestsLeft = today ? Math.max(0, 50 - today.requests) : null;

  // reset leaf when conversation changes
  useEffect(() => {
    setLeafId(null);
    setStreamMsg(null);
    setError('');
  }, [conversationId]);

  // autoscroll
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [display.length, streamMsg?.content]);

  // ---- Send ----
  const send = useCallback(
    async (opts?: { content?: string; parentId?: string | null; model?: string }) => {
      setError('');
      setToolStatus(null);
      const text = (opts?.content ?? input).trim();
      if (!text) return;
      if (streaming) return;

      // Safe Mode: show a flight plan before spending
      if (safeMode && !opts?.content) {
        const estIn = ctxTokens + Math.ceil(text.length / 4) + 120;
        const estOut = agentMode ? 900 : 420;
        const m = modelsData?.models.find((x) => x.id === model);
        const estCost = m
          ? (estIn / 1e6) * (m.input_price_per_1m ?? 0) + (estOut / 1e6) * (m.output_price_per_1m ?? 0)
          : 0;
        setFlightPlan({ text, inTok: estIn, outTok: estOut, cost: estCost });
        return;
      }

      const useModel = opts?.model ?? model;

      // parent for the new user message
      const parentId = opts?.parentId ?? path[path.length - 1]?.id ?? null;

      const payload: Parameters<typeof streamChat>[0] = {
        conversation_id: conversationId || undefined,
        mode: agentMode ? 'agent' : 'chat',
        model: useModel,
        content: text,
        parent_message_id: parentId,
        attachments: fileMeta,
        images,
      };

      {
        // optimistic: add a local user message so the UI updates immediately
        const optimistic: LocalMsg = {
          id: 'local-' + Date.now(),
          conversation_id: conversationId ?? '',
          user_id: session!.user.id,
          parent_message_id: parentId,
          role: 'user',
          content: text,
          attachments: fileMeta,
          model: null,
          tokens_in: null,
          tokens_out: null,
          cost_usd: null,
          created_at: new Date().toISOString(),
        };
        setStreamMsg(optimistic);
        setInput('');
        setImages([]);
        setFileMeta([]);
      }

      // assistant streaming placeholder
      const aId = 'local-a-' + Date.now();
      setStreaming(true);
      const placeholder: LocalMsg = {
        id: aId,
        conversation_id: conversationId ?? '',
        user_id: session!.user.id,
        parent_message_id: parentId,
        role: 'assistant',
        content: '',
        attachments: [],
        model: useModel,
        tokens_in: null,
        tokens_out: null,
        cost_usd: null,
        created_at: new Date().toISOString(),
        streaming: true,
      };

      try {
        await streamChat(payload, {
          onMeta: (meta) => {
            if (!conversationId && meta.conversation_id) {
              navigate(`/chat/${meta.conversation_id}`, { replace: true });
            }
            // fold optimistic user msg into streamMsg (assistant)
            setStreamMsg({ ...placeholder, id: meta.message_id || aId, model: meta.model });
          },
          onDelta: (d) => {
            setStreamMsg((prev) => (prev ? { ...prev, content: prev.content + d } : prev));
          },
          onError: (msg) => {
            setError(msg);
            setStreamMsg(null);
          },
          onTool: (t) => {
            if (t.phase === 'start') {
              const detail = t.name === 'web_search' ? String((t.args as any)?.query ?? '') : String((t.args as any)?.url ?? '');
              setToolStatus({ name: t.name, detail });
            } else {
              setToolStatus(null);
            }
          },
          onDone: () => {
            setStreamMsg(null);
            qc.invalidateQueries({ queryKey: ['messages', conversationId] });
            qc.invalidateQueries({ queryKey: ['conversations'] });
            qc.invalidateQueries({ queryKey: ['conversation', conversationId] });
            qc.invalidateQueries({ queryKey: ['usage-totals'] });
            qc.invalidateQueries({ queryKey: ['usage-today'] });
          },
        });
      } catch (err: any) {
        setError(err?.message || 'Failed to send');
        setStreamMsg(null);
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [input, streaming, model, fileMeta, images, path, conversationId, agentMode, session, navigate, qc, safeMode, ctxTokens, modelsData]
  );

  const stop = () => {
    abortRef.current?.abort();
    setStreaming(false);
    setStreamMsg(null);
  };

  const confirmFlight = (chosenModel?: string) => {
    const fp = flightPlan;
    setFlightPlan(null);
    if (fp) send({ content: fp.text, model: chosenModel });
  };

  const compress = async () => {
    if (!conversationId || compressing) return;
    setCompressing(true);
    setError('');
    try {
      await compressConversation(conversationId, model);
      qc.invalidateQueries({ queryKey: ['messages', conversationId] });
      qc.invalidateQueries({ queryKey: ['conversation', conversationId] });
    } catch (e: any) {
      setError(e?.message || 'Could not compress this conversation');
    } finally {
      setCompressing(false);
    }
  };

  // ---- File / image handling ----
  const onFiles = async (files: FileList) => {
    for (const file of Array.from(files)) {
      if (file.size > 25 * 1024 * 1024) {
        setError(`${file.name} exceeds 25MB`);
        continue;
      }
      if (file.type.startsWith('image/') && file.size <= 4 * 1024 * 1024) {
        const reader = new FileReader();
        reader.onload = () => setImages((prev) => [...prev, reader.result as string]);
        reader.readAsDataURL(file);
      } else {
        // non-image: upload to storage; content intelligence arrives in Phase 2
        const path = `${session!.user.id}/${crypto.randomUUID()}`;
        const { error } = await supabase.storage.from('user-files').upload(path, file);
        if (error) {
          setError(`Upload failed: ${error.message}`);
        } else {
          setFileMeta((prev) => [...prev, { name: file.name, mime: file.type, size: file.size, path }]);
        }
      }
    }
  };

  // ---- Conversation actions ----
  const updateConv = async (patch: Record<string, unknown>) => {
    if (!conversationId) return;
    await supabase.from('conversations').update(patch).eq('id', conversationId);
    qc.invalidateQueries({ queryKey: ['conversation', conversationId] });
    qc.invalidateQueries({ queryKey: ['conversations'] });
  };

  const deleteConv = async () => {
    if (!conversationId || !confirm('Delete this conversation? This cannot be undone.')) return;
    await supabase.from('conversations').delete().eq('id', conversationId);
    qc.invalidateQueries({ queryKey: ['conversations'] });
    navigate('/chat');
  };

  const exportChat = () => {
    const out = {
      title: conv?.title,
      model,
      exported_at: new Date().toISOString(),
      messages: display.map((m) => ({ role: m.role, content: m.content, model: m.model })),
    };
    downloadFile(`${(conv?.title || 'chat').replace(/[^a-z0-9]+/gi, '-')}.json`, JSON.stringify(out, null, 2));
  };

  const rename = async () => {
    const title = prompt('Conversation title', conv?.title);
    if (title) await updateConv({ title });
  };

  const [editingId, setEditingId] = useState<string | null>(null);
  const branchFrom = (msg: Message) => {
    setLeafId(msg.parent_message_id ?? msg.id);
    setInput(msg.role === 'user' ? msg.content : '');
    setStreamMsg(null);
  };

  // Regenerate: re-send the last user message as a sibling branch
  const regenerate = () => {
    const lastUser = [...display].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    send({ content: lastUser.content, parentId: lastUser.parent_message_id ?? null });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <header className="flex items-center gap-2 border-b border-surface-200 px-3 py-2 dark:border-surface-800">
        <button onClick={toggleSidebar} className="icon-btn" aria-label="Toggle sidebar" title="Toggle sidebar">☰</button>
        <button onClick={rename} className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:text-accent-600" title="Rename">
          {conv?.title || 'New conversation'}
        </button>
        {conv && (
          <button
            onClick={() => updateConv({ pinned: !conv.pinned })}
            className={`icon-btn ${conv.pinned ? 'text-accent-500' : ''}`}
            title="Pin"
          >
            ★
          </button>
        )}
        <ModelPicker value={model} onChange={setModel} />
        <div className="hidden items-center gap-2 md:flex">
          <ContextGauge tokens={ctxTokens} limit={ctxLimit} />
          <UsagePill today={today} />
        </div>
        {conversationId && path.length > 10 && (
          <button
            onClick={compress}
            disabled={compressing}
            className={`icon-btn ${compressing ? 'opacity-60' : ''}`}
            title="Smart Compress: fold older messages into a memory brief so nothing is forgotten"
          >
            {compressing ? '⏳' : '🧠'}
          </button>
        )}
        <button onClick={exportChat} className="icon-btn" title="Export">⤓</button>
        {conv && (
          <button
            onClick={() => updateConv({ archived: !conv.archived })}
            className="icon-btn"
            title={conv.archived ? 'Unarchive' : 'Archive'}
          >
            🗄
          </button>
        )}
        {conv && <button onClick={deleteConv} className="icon-btn" title="Delete">🗑</button>}
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6">
          {display.length === 0 && <EmptyState />}
          {display.map((m, i) => (
            <MessageBubble
              key={m.id}
              msg={m}
              isLast={i === display.length - 1}
              streaming={!!(m as LocalMsg).streaming}
              onBranch={() => branchFrom(m)}
              onRegenerate={i === display.length - 1 ? regenerate : undefined}
            />
          ))}
          {error && (
            <div className="mt-4 rounded-xl border border-red-300/40 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}
        </div>
      </div>

      {toolStatus && (
        <div className="mx-auto max-w-3xl px-4 pb-1">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-500/10 px-3 py-1 text-xs text-accent-700 dark:text-accent-300">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-accent-400 border-t-transparent" />
            {toolStatus.name === 'web_search' ? `Searching: ${toolStatus.detail}` : `Reading: ${toolStatus.detail}`}
          </span>
        </div>
      )}

      {/* Composer */}
      <div className="border-t border-surface-200 bg-surface-50 px-4 py-3 dark:border-surface-800 dark:bg-surface-900">
        <div className="mx-auto max-w-3xl">
          {images.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {images.map((src, i) => (
                <div key={i} className="relative">
                  <img src={src} alt="" className="h-16 w-16 rounded-lg object-cover" />
                  <button
                    onClick={() => setImages((p) => p.filter((_, j) => j !== i))}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-surface-900 text-xs text-white"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          {fileMeta.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {fileMeta.map((f, i) => (
                <span key={i} className="flex items-center gap-1.5 rounded-lg bg-surface-100 px-2 py-1 text-xs dark:bg-surface-800">
                  📄 {f.name}
                  <button onClick={() => setFileMeta((p) => p.filter((_, j) => j !== i))} className="text-surface-400 hover:text-red-500">✕</button>
                </span>
              ))}
              <span className="self-center text-[10px] text-surface-400">File intelligence arrives in Phase 2</span>
            </div>
          )}
          <div className="flex items-end gap-2 rounded-xl border border-surface-200 bg-white px-3 py-2 shadow-soft dark:border-surface-700 dark:bg-surface-950">
            <button
              onClick={() =>
                setSafeMode((v) => {
                  localStorage.setItem('infora-safe-mode', v ? '0' : '1');
                  return !v;
                })
              }
              className={`btn-outline shrink-0 px-3 py-1.5 text-sm ${safeMode ? 'border-accent-500 text-accent-600 dark:text-accent-400' : ''}`}
              title="Safe Mode: review a token & cost flight plan before every send"
            >
              🛡 Safe
            </button>
            <button
              onClick={() => setAgentMode((v) => !v)}
              className={`btn-outline shrink-0 px-3 py-1.5 text-sm ${agentMode ? 'border-accent-500 text-accent-600 dark:text-accent-400' : ''}`}
              title="Agent mode: AI can search the web and read pages to complete tasks"
            >
              ⚡ Agent
            </button>
            {speechSupported && (
    <button
      onClick={toggleMic}
      className={`btn-outline shrink-0 px-3 py-1.5 text-sm ${listening ? "border-red-400 text-red-500 animate-pulse" : ""}`}
      title={listening ? "Stop voice input" : "Speak (voice input)"}
    >
      {listening ? "◉ Listening…" : "🎤"}
    </button>
  )}
            <label className="icon-btn shrink-0 cursor-pointer" title="Attach">
              📎
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => e.target.files && onFiles(e.target.files)}
              />
            </label>
            <textarea
              className="max-h-40 min-h-[24px] flex-1 resize-none bg-transparent py-1 text-sm outline-none placeholder:text-surface-400"
              placeholder="Message Infora AI…  (Enter to send, Shift+Enter for newline)"
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            {streaming ? (
              <button onClick={stop} className="btn-outline shrink-0 px-3 py-1.5 text-sm">■ Stop</button>
            ) : (
              <button
                onClick={() => send()}
                disabled={!input.trim() && !images.length}
                className="btn-primary shrink-0 px-3 py-1.5 text-sm"
              >
                ↑ Send
              </button>
            )}
          </div>
          <p className="mt-1.5 text-center text-[10px] text-surface-400">
            AI can make mistakes. Verify important information.
          </p>
        </div>
      </div>

      {flightPlan && (
        <FlightPlanModal
          plan={flightPlan}
          model={model}
          models={modelsData?.models ?? []}
          requestsLeft={requestsLeft}
          onConfirm={confirmFlight}
          onCancel={() => setFlightPlan(null)}
        />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <svg width="48" height="48" viewBox="0 0 32 32" className="mb-4 opacity-80">
        <circle cx="16" cy="16" r="13" fill="none" stroke="#ff7a1a" strokeWidth="2.5" />
        <circle cx="16" cy="16" r="5" fill="#ff7a1a" />
      </svg>
      <h2 className="text-xl font-semibold tracking-tight">How can I help you today?</h2>
      <p className="mt-2 max-w-sm text-sm text-surface-500">
        Ask anything, upload images for analysis, or start a research thread. Switch models anytime.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {['Summarise a contract for me', 'Analyse this spreadsheet', 'Draft a project proposal', 'Explain a concept simply'].map((s) => (
          <div key={s} className="card px-4 py-3 text-left text-sm text-surface-500">{s}</div>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({
  msg,
  isLast,
  streaming,
  onBranch,
  onRegenerate,
}: {
  msg: Message;
  isLast: boolean;
  streaming: boolean;
  onBranch: () => void;
  onRegenerate?: () => void;
}) {
  const isUser = msg.role === 'user';
  return (
    <div className="mb-6 animate-fade-up">
      <div className="mb-1.5 flex items-center gap-2 text-xs text-surface-400">
        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-medium ${isUser ? 'bg-surface-200 dark:bg-surface-800' : 'bg-accent-600 text-white'}`}>
          {isUser ? 'You' : 'S'}
        </span>
        <span>{isUser ? 'You' : msg.model || 'Assistant'}</span>
        {streaming && <span className="inline-flex h-3 w-3 animate-spin rounded-full border-2 border-accent-400 border-t-transparent" />}
      </div>
      <div className={`pl-8 ${isUser ? '' : ''}`}>
        {isUser ? (
          <div className="whitespace-pre-wrap text-[15px] leading-7">{msg.content}</div>
        ) : (
          <Markdown content={msg.content || (streaming ? '…' : '')} />
        )}
      </div>
      {/* actions */}
      {!streaming && msg.content && (
        <div className="mt-1.5 flex items-center gap-1 pl-8 opacity-0 transition-opacity group-hover:opacity-100" style={{ opacity: 1 }}>
          <CopyButton text={msg.content} />
          <button onClick={onBranch} className="btn-ghost px-2 py-1 text-xs" title="Branch from here">🌿 Branch</button>
          {onRegenerate && <button onClick={onRegenerate} className="btn-ghost px-2 py-1 text-xs" title="Regenerate">↻ Regenerate</button>}
        </div>
      )}
      {/* assistant meta */}
      {!isUser && !streaming && (msg.tokens_in || msg.tokens_out) && (
        <div className="mt-1 pl-8 text-[10px] text-surface-400">
          {msg.tokens_in ? `${formatTokens(msg.tokens_in)} in` : ''} {msg.tokens_out ? `· ${formatTokens(msg.tokens_out)} out` : ''}
          {msg.cost_usd ? ` · $${msg.cost_usd.toFixed(4)}` : ''}
          {msg.model ? ` · ${msg.model}` : ''}
        </div>
      )}
    </div>
  );
}

function ContextGauge({ tokens, limit }: { tokens: number; limit: number }) {
  if (!limit) return null;
  const pct = Math.min(100, (tokens / limit) * 100);
  const bar = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500';
  const txt = pct >= 90 ? 'text-red-500' : pct >= 70 ? 'text-amber-500' : 'text-emerald-500';
  return (
    <div
      className="flex items-center gap-1.5"
      title={`Context: ~${formatTokens(tokens)} of ${formatTokens(limit)} tokens (${pct.toFixed(0)}%) — Smart Compress (🧠) frees space without forgetting`}
    >
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-200 dark:bg-surface-800">
        <div className={`h-full transition-all ${bar}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[10px] tabular-nums ${txt}`}>
        {formatTokens(tokens)}/{formatTokens(limit)}
      </span>
    </div>
  );
}

function UsagePill({
  today,
}: {
  today?: { requests: number; tokens_in: number; tokens_out: number; cost: number; errors?: number };
}) {
  if (!today) return null;
  const left = Math.max(0, 50 - today.requests);
  const cls =
    left <= 4
      ? 'border-red-400/60 text-red-500'
      : left <= 10
        ? 'border-amber-400/60 text-amber-500'
        : 'border-surface-200 text-surface-500 dark:border-surface-700';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] tabular-nums ${cls}`}
      title={`Today: ${today.requests} of 50 free requests · ${formatTokens(today.tokens_in + today.tokens_out)} tokens · ${formatCost(today.cost)} est. spend`}
    >
      ⚡ {today.requests}/50
    </span>
  );
}

function FlightPlanModal({
  plan,
  model,
  models,
  requestsLeft,
  onConfirm,
  onCancel,
}: {
  plan: { text: string; inTok: number; outTok: number; cost: number };
  model: string;
  models: ModelInfo[];
  requestsLeft: number | null;
  onConfirm: (model?: string) => void;
  onCancel: () => void;
}) {
  const [pick, setPick] = useState(model);
  const freeModel = useMemo(
    () =>
      models
        .filter((m) => m.id.endsWith(':free') && m.context_length >= 32000)
        .sort((a, b) => b.context_length - a.context_length)[0],
    [models]
  );
  const chosen = models.find((m) => m.id === pick);
  const estCost = chosen
    ? (plan.inTok / 1e6) * (chosen.input_price_per_1m ?? 0) + (plan.outTok / 1e6) * (chosen.output_price_per_1m ?? 0)
    : plan.cost;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCancel}>
      <div className="card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">🛡 Flight plan</h3>
        <p className="mt-1 line-clamp-2 text-sm text-surface-500">{plan.text}</p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-surface-100 p-2 dark:bg-surface-800/60">
            <p className="text-[10px] text-surface-400">Input ~</p>
            <p className="text-sm font-semibold tabular-nums">{formatTokens(plan.inTok)}</p>
          </div>
          <div className="rounded-lg bg-surface-100 p-2 dark:bg-surface-800/60">
            <p className="text-[10px] text-surface-400">Output ~</p>
            <p className="text-sm font-semibold tabular-nums">{formatTokens(plan.outTok)}</p>
          </div>
          <div className="rounded-lg bg-surface-100 p-2 dark:bg-surface-800/60">
            <p className="text-[10px] text-surface-400">Est. cost</p>
            <p className="text-sm font-semibold tabular-nums">{estCost === 0 ? 'Free' : `$${estCost.toFixed(4)}`}</p>
          </div>
        </div>
        <p className="mt-2 text-xs text-surface-400">
          {requestsLeft === null
            ? 'Based on your conversation so far.'
            : requestsLeft > 0
              ? `${requestsLeft} free requests left today (team-wide).`
              : 'Free daily quota is used up — this request may fail or cost money.'}
        </p>
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium text-surface-400">Choose engine</p>
          <button
            onClick={() => setPick(model)}
            className={`w-full rounded-lg border p-3 text-left text-sm ${pick === model ? 'border-accent-500 bg-accent-500/10' : 'border-surface-200 dark:border-surface-700'}`}
          >
            ⭐ Best — {models.find((m) => m.id === model)?.name ?? model}
          </button>
          {freeModel && freeModel.id !== model && (
            <button
              onClick={() => setPick(freeModel.id)}
              className={`w-full rounded-lg border p-3 text-left text-sm ${pick === freeModel.id ? 'border-accent-500 bg-accent-500/10' : 'border-surface-200 dark:border-surface-700'}`}
            >
              💰 Cheapest — {freeModel.name} · always $0
            </button>
          )}
        </div>
        <div className="mt-5 flex gap-2">
          <button onClick={onCancel} className="btn-outline flex-1">Cancel</button>
          <button onClick={() => onConfirm(pick)} className="btn-primary flex-1">Confirm & send</button>
        </div>
      </div>
    </div>
  );
}
