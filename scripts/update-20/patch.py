import sys

root = sys.argv[1] if len(sys.argv) > 1 else '.'

# ================= src/lib/api.ts =================
p = f'{root}/src/lib/api.ts'
s = open(p).read()

# A1: force_model in the payload interface
a = "  model?: string;\n  level?: 1 | 2 | 3;"
n = "  model?: string;\n  force_model?: string;\n  level?: 1 | 2 | 3;"
assert s.count(a) == 1, 'api-anchor1'
s = s.replace(a, n, 1)

# A2: rewritePrompt helper (calls the chat edge function's rewrite_prompt action)
a = """  if (!res.ok) {
    let message = `Compress failed (${res.status})`;
    try {
      const j = await res.json();
      message = j.message || j.error || message;
    } catch {}
    throw new Error(message);
  }
}
"""
n = a + """
export async function rewritePrompt(content: string): Promise<{ rewritten: string; model: string; fallback_free: boolean; credits_charged: number }> {
  const headers = await authHeaders();
  const res = await fetch(`${EDGE_FUNCTION_BASE}/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'rewrite_prompt', content }),
  });
  if (!res.ok) {
    let message = `Rewrite failed (${res.status})`;
    try {
      const j = await res.json();
      message = j.message || j.error || message;
    } catch {}
    throw new Error(message);
  }
  return res.json();
}
"""
assert s.count(a) == 1, 'api-anchor2'
s = s.replace(a, n, 1)
open(p, 'w').write(s)
print('api.ts patched OK')

# ================= src/routes/Chat.tsx =================
p = f'{root}/src/routes/Chat.tsx'
s = open(p).read()

# E1: import the rewrite helper
a = "import { streamChat, downloadFile, compressConversation } from '../lib/api';"
n = "import { streamChat, downloadFile, compressConversation, rewritePrompt as apiRewritePrompt } from '../lib/api';"
assert s.count(a) == 1, 'anchor1'
s = s.replace(a, n, 1)

# E2: module-level emoji helpers (emoji must be base64-decoded, never literal bytes) + reprompt pool
a = """interface LocalMsg extends Message {
  streaming?: boolean;
}
"""
n = a + """
const b64d = (b64: string): string => {
  try {
    if (typeof atob === 'function' && typeof TextDecoder !== 'undefined') {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    }
  } catch {}
  return '';
};
const EMOJI_WAND = b64d('8J+qhA==');
const EMOJI_SPARKLE = b64d('4pyo');
const EMOJI_REPEAT = b64d('8J+UgQ==');
const EMOJI_SPEAKER = b64d('8J+Uig==');
const REPROMPT_MODELS = ['deepseek/deepseek-v3.1', 'openai/gpt-5.6-luna', 'google/gemma-3-27b-it'];
"""
assert s.count(a) == 1, 'anchor2'
s = s.replace(a, n, 1)

# E3: rewriter state
a = """  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);
"""
n = """  const [listening, setListening] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [rewritten, setRewritten] = useState(false);
  const recRef = useRef<any>(null);
"""
assert s.count(a) == 1, 'anchor3'
s = s.replace(a, n, 1)

# E4: rewrite handler after toggleMic
a = """    recRef.current = rec;
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  };
"""
n = a + """
  // Phase 26: magic prompt rewriter - tap before sending to improve the draft prompt
  const rewrite = async () => {
    const text = input.trim();
    if (!text || rewriting) return;
    setRewriting(true);
    setError('');
    try {
      const r = await apiRewritePrompt(text);
      if (r && r.rewritten) {
        setInput(r.rewritten);
        setRewritten(true);
      }
    } catch (e: any) {
      setError(e?.message || 'Could not rewrite this prompt');
    } finally {
      setRewriting(false);
    }
  };
"""
assert s.count(a) == 1, 'anchor4'
s = s.replace(a, n, 1)

# E5: send opts gains forceModel
a = "    async (opts?: { content?: string; parentId?: string | null; model?: string }) => {"
n = "    async (opts?: { content?: string; parentId?: string | null; model?: string; forceModel?: string }) => {"
assert s.count(a) == 1, 'anchor5'
s = s.replace(a, n, 1)

# E6: payload carries force_model
a = """        mode: agentMode ? 'agent' : 'chat',
        model: useModel,
"""
n = """        mode: agentMode ? 'agent' : 'chat',
        model: useModel,
        ...(opts?.forceModel ? { force_model: opts.forceModel } : {}),
"""
assert s.count(a) == 1, 'anchor6'
s = s.replace(a, n, 1)

# E7: clear the rewritten badge once the prompt is sent
a = """        setStreamMsg(optimistic);
        setInput('');
"""
n = """        setStreamMsg(optimistic);
        setInput('');
        setRewritten(false);
"""
assert s.count(a) == 1, 'anchor7'
s = s.replace(a, n, 1)

# E8: reprompt handler after regenerate
a = """  // Regenerate: re-send the last user message as a sibling branch
  const regenerate = () => {
    const lastUser = [...display].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    send({ content: lastUser.content, parentId: lastUser.parent_message_id ?? null });
  };
"""
n = a + """
  // Phase 26: reprompt - same question, forced different model (rotating pool)
  const reprompt = (m: Message) => {
    if (streaming) return;
    const parent = m.parent_message_id ? msgMap.get(m.parent_message_id) : undefined;
    if (!parent || parent.role !== 'user') {
      setError('Could not find the original question for this reply.');
      return;
    }
    const ordered = REPROMPT_MODELS.filter((x) => x !== m.model);
    const pick = ordered[0] || REPROMPT_MODELS[0];
    send({ content: parent.content, parentId: parent.parent_message_id ?? null, model: pick, forceModel: pick });
  };
"""
assert s.count(a) == 1, 'anchor8'
s = s.replace(a, n, 1)

# E9: pass onReprompt into every assistant bubble
a = "              onRegenerate={i === display.length - 1 ? regenerate : undefined}"
n = """              onRegenerate={i === display.length - 1 ? regenerate : undefined}
              onReprompt={m.role === 'assistant' && !(m as LocalMsg).streaming ? () => reprompt(m) : undefined}"""
assert s.count(a) == 1, 'anchor9'
s = s.replace(a, n, 1)

# E10: magic wand chip + "rewritten" badge in the composer tools row (before Safe)
a = """              <button
                onClick={() =>
                  setSafeMode((v) => {
"""
n = """              <button
                onClick={rewrite}
                disabled={rewriting || !input.trim()}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm transition-colors disabled:opacity-40 ${rewritten ? 'border-accent-500 bg-accent-500/10 text-accent-600 dark:text-accent-400' : 'border-surface-300 text-surface-500 hover:border-accent-500 hover:text-accent-600 dark:border-surface-600 dark:text-surface-300'}`}
                title="Magic rewrite - let AI improve this prompt before you send it"
              >
                {rewriting ? <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-accent-400 border-t-transparent" /> : EMOJI_WAND}
              </button>
              {rewritten && !rewriting && (
                <span className="shrink-0 rounded-full bg-accent-500/10 px-2 py-0.5 text-[10px] font-medium text-accent-600 dark:text-accent-400" title="This prompt was improved by the magic rewriter - you can edit it before sending">
                  rewritten {EMOJI_SPARKLE}
                </span>
              )}
              <button
                onClick={() =>
                  setSafeMode((v) => {
"""
assert s.count(a) == 1, 'anchor10'
s = s.replace(a, n, 1)

# E11: MessageBubble signature gains onReprompt
a = """function MessageBubble({
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
"""
n = """function MessageBubble({
  msg,
  isLast,
  streaming,
  onBranch,
  onRegenerate,
  onReprompt,
}: {
  msg: Message;
  isLast: boolean;
  streaming: boolean;
  onBranch: () => void;
  onRegenerate?: () => void;
  onReprompt?: () => void;
}) {
"""
assert s.count(a) == 1, 'anchor11'
s = s.replace(a, n, 1)

# E12: read-aloud state + toggle after previewHtml
a = "  const [previewHtml, setPreviewHtml] = useState<string | null>(null);"
n = a + """
  const [speaking, setSpeaking] = useState(false);
  const speakingRef = useRef(false);
  useEffect(() => {
    return () => {
      if (speakingRef.current) {
        try { window.speechSynthesis.cancel(); } catch {}
      }
    };
  }, []);
  const speechOk = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const toggleRead = () => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!synth) return;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    synth.cancel();
    const stripped = (msg.content || '')
      .replace(/!\\[([^\\]]*)\\]\\(([^)]*)\\)/g, '$1')
      .replace(/\\[([^\\]]+)\\]\\(([^)]*)\\)/g, '$1')
      .replace(/```[a-zA-Z0-9]*\\n?/g, '')
      .replace(/[#*_`>~|^]/g, ' ')
      .replace(/\\s+/g, ' ')
      .trim();
    const u = new SpeechSynthesisUtterance(stripped || (msg.content || ''));
    const voices = synth.getVoices();
    const v =
      voices.find((x) => x.lang === 'en-IN') ||
      voices.find((x) => x.lang === 'en-GB') ||
      voices.find((x) => x.lang === 'en-US') ||
      voices.find((x) => x.lang && x.lang.startsWith('en'));
    if (v) u.voice = v;
    u.lang = v?.lang || 'en-IN';
    u.rate = 1;
    u.onend = () => { speakingRef.current = false; setSpeaking(false); };
    u.onerror = () => { speakingRef.current = false; setSpeaking(false); };
    speakingRef.current = true;
    setSpeaking(true);
    synth.speak(u);
  };
"""
assert s.count(a) == 1, 'anchor12'
s = s.replace(a, n, 1)

# E13: Listen + Try another model buttons in the message actions row
a = "          <CopyButton text={msg.content} />"
n = a + """
          {!isUser && speechOk && (
            <button
              onClick={toggleRead}
              className={`btn-ghost px-2 py-1 text-xs ${speaking ? 'text-accent-600 dark:text-accent-400' : ''}`}
              title={speaking ? 'Stop reading aloud' : 'Read this reply aloud'}
            >
              {EMOJI_SPEAKER} {speaking ? 'Stop' : 'Listen'}
            </button>
          )}
          {onReprompt && (
            <button onClick={onReprompt} className="btn-ghost px-2 py-1 text-xs" title="Ask a different AI model the same question">
              {EMOJI_REPEAT} Try another model
            </button>
          )}"""
assert s.count(a) == 1, 'anchor13'
s = s.replace(a, n, 1)

open(p, 'w').write(s)
print('Chat.tsx patched OK')
