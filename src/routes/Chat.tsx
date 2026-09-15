import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { streamChat, downloadFile } from '../lib/api';
import { useUIStore } from '../lib/stores';
import { useModels, useSession } from '../hooks/useSession';
import { timeAgo, formatTokens, type Message } from '../lib/types';
import ModelPicker from '../components/chat/ModelPicker';
import { Markdown, CopyButton } from '../components/Markdown';

interface LocalMsg extends Message {
  streaming?: boolean;
}

export default function Chat() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { setSidebar } = useUIStore();
  const { data: modelsData } = useModels();
  const { session } = useSession();

  const defaultModel = modelsData?.default_model ?? 'openai/gpt-4o-mini';
  const [model, setModel] = useState(defaultModel);
  useEffect(() => setModel(defaultModel), [defaultModel]);

  const [input, setInput] = useState('');
  const [images, setImages] = useState<string[]>([]); // data URLs
  const [fileMeta, setFileMeta] = useState<{ name: string; mime: string; size: number; path?: string }[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

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
    async (opts?: { content?: string; parentId?: string | null }) => {
      setError('');
      const text = (opts?.content ?? input).trim();
      if (!text) return;
      if (streaming) return;

      // parent for the new user message
      const parentId = opts?.parentId ?? path[path.length - 1]?.id ?? null;

      const payload: Parameters<typeof streamChat>[0] = {
        conversation_id: conversationId || undefined,
        model,
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
        model,
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
          onDone: () => {
            setStreamMsg(null);
            qc.invalidateQueries({ queryKey: ['messages', conversationId] });
            qc.invalidateQueries({ queryKey: ['conversations'] });
            qc.invalidateQueries({ queryKey: ['conversation', conversationId] });
            qc.invalidateQueries({ queryKey: ['usage-totals'] });
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
    [input, streaming, model, fileMeta, images, path, conversationId, session, navigate, qc]
  );

  const stop = () => {
    abortRef.current?.abort();
    setStreaming(false);
    setStreamMsg(null);
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
        <button onClick={() => setSidebar(true)} className="icon-btn md:hidden" aria-label="Open sidebar">☰</button>
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
              placeholder="Message Synapse…  (Enter to send, Shift+Enter for newline)"
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
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <svg width="48" height="48" viewBox="0 0 32 32" className="mb-4 opacity-80">
        <circle cx="16" cy="16" r="13" fill="none" stroke="#3375ff" strokeWidth="2.5" />
        <circle cx="16" cy="16" r="5" fill="#3375ff" />
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
