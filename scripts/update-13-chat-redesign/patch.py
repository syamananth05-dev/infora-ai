import sys

root = sys.argv[1] if len(sys.argv) > 1 else '.'

def patch(path, pairs):
    p = f'{root}/{path}'
    s = open(p).read()
    for old, new in pairs:
        n = s.count(old)
        if n != 1:
            raise SystemExit(f'{path}: anchor count={n}: {old[:70]!r}')
        s = s.replace(old, new, 1)
    open(p, 'w').write(s)
    print(f'patched {path}')

# ---------- 1. menuOpen state ----------
patch('src/routes/Chat.tsx', [
    (r'''  const [editingId, setEditingId] = useState<string | null>(null);''',
     r'''  const [menuOpen, setMenuOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);'''),

    # ---------- 2. mic error handling ----------
    (r'''    rec.onerror = () => setListening(false);''',
     r'''    rec.onerror = (e: any) => {
      const err = String(e?.error || '');
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        recRef.current = null;
        try { rec.stop(); } catch {}
        setListening(false);
        alert('Microphone access is blocked. Allow mic permission for this site (tap the lock / site-settings icon in your browser), then tap the mic again.');
      }
      // 'no-speech', 'network', 'aborted' are transient - onend auto-restarts
    };'''),

    # ---------- 3. header: collapse clutter into a ... menu ----------
    (r'''        {conv && (
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
        <button onClick={shareChat} className="icon-btn" title="Share: copy a public link to this conversation">🔗</button>
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
        {conv && <button onClick={deleteConv} className="icon-btn" title="Delete">🗑</button>}''',
     r'''        <ModelPicker
          founder={founder}
          value={modelSelection}
          onChange={(v: string) => {
            setModelSelection(v);
            setModel(v === 'best' || v === 'free' ? '' : v);
          }}
        />
        <div className="hidden items-center gap-2 md:flex">
          <ContextGauge tokens={ctxTokens} limit={ctxLimit} />
          <UsagePill today={today} />
        </div>
        <button onClick={shareChat} className="icon-btn" title="Share: copy a public link to this conversation">🔗</button>
        <div className="relative">
          <button onClick={() => setMenuOpen((v) => !v)} className="icon-btn" title="Conversation options">⋯</button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
              <div className="card absolute right-0 z-40 mt-1 w-52 py-1 animate-fade-up">
                <button onClick={() => { setMenuOpen(false); rename(); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-100 dark:hover:bg-surface-800">✏️ Rename</button>
                {conv && (
                  <>
                    <button onClick={() => { setMenuOpen(false); updateConv({ pinned: !conv.pinned }); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-100 dark:hover:bg-surface-800">{conv.pinned ? '★ Unpin' : '★ Pin'}</button>
                    <button onClick={() => { setMenuOpen(false); exportChat(); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-100 dark:hover:bg-surface-800">⤓ Export</button>
                    <button onClick={() => { setMenuOpen(false); updateConv({ archived: !conv.archived }); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-100 dark:hover:bg-surface-800">{conv.archived ? '🗄 Unarchive' : '🗄 Archive'}</button>
                    <button onClick={() => { setMenuOpen(false); deleteConv(); }} className="block w-full px-3 py-2 text-left text-sm text-red-500 hover:bg-surface-100 dark:hover:bg-surface-800">🗑 Delete</button>
                  </>
                )}
                {conversationId && path.length > 10 && (
                  <button onClick={() => { setMenuOpen(false); compress(); }} disabled={compressing} className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-100 disabled:opacity-50 dark:hover:bg-surface-800">{compressing ? 'Compressing…' : '🧠 Smart Compress'}</button>
                )}
              </div>
            </>
          )}
        </div>'''),

    # ---------- 4. remove Phase 2 note ----------
    (r'''              <span className="self-center text-[10px] text-surface-400">File intelligence arrives in Phase 2</span>
''',
     r''''''),

    # ---------- 5. composer redesign ----------
    (r'''          <div className="flex items-end gap-2 rounded-xl border border-surface-200 bg-white px-3 py-2 shadow-soft dark:border-surface-700 dark:bg-surface-950">
            <button
              onClick={() =>
                setSafeMode((v) => {
                  localStorage.setItem('infora-safe-mode', v ? '0' : '1');
                  return !v;
                })
              }
              className={`btn-outline shrink-0 px-2.5 py-1.5 text-sm ${safeMode ? 'border-accent-500 text-accent-600 dark:text-accent-400' : ''}`}
              title="Safe Mode: review the estimated credits before every send"
            >
              🛡
            </button>
            <button
              onClick={() => {
                if (!agentMode && !window.confirm('Turn on Agent mode? The AI can search the web and read pages to complete bigger tasks (uses more credits).')) return;
                setAgentMode((v) => !v);
              }}
              className={`btn-outline shrink-0 px-2.5 py-1.5 text-sm ${agentMode ? 'border-accent-500 text-accent-600 dark:text-accent-400' : ''}`}
              title="Agent mode: AI can search the web and read pages to complete tasks"
            >
              ⚡
            </button>
            {founder && (
              <select
                value={modelSelection}
                onChange={(e) => setModelSelection(e.target.value)}
                className="input w-auto shrink-0 py-1.5 text-sm"
                title="Founder: model selection"
              >
                <option value="best">The Best</option>
                <option value="free">FREE</option>
                <optgroup label="Premium models">
                  <option value="deepseek/deepseek-v3.1">DeepSeek V3.1</option>
                  <option value="openai/gpt-5.6-luna">GPT-5.6 Luna</option>
                  <option value="openai/gpt-4o-mini">GPT-4o mini</option>
                  <option value="anthropic/claude-3.5-haiku-20241022">Claude Haiku</option>
                </optgroup>
                <optgroup label="Cheap models">
                  <option value="google/gemma-3-27b-it">Gemma 3 27B</option>
                  <option value="mistralai/mistral-nemo">Mistral Nemo</option>
                </optgroup>
                <optgroup label="All OpenRouter models">
                  {(modelsData?.models ?? []).map((m) => (
                    <option key={m.id} value={m.id}>{m.id}</option>
                  ))}
                </optgroup>
              </select>
            )}
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
          </div>''',
     r'''          <div className="rounded-2xl border border-surface-200 bg-white shadow-soft focus-within:border-accent-500/60 dark:border-surface-700 dark:bg-surface-950">
            <textarea
              className="max-h-48 min-h-[52px] w-full resize-none bg-transparent px-4 pb-1 pt-3 text-[15px] outline-none placeholder:text-surface-400"
              placeholder="Message Infora AI…"
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 192) + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <div className="flex flex-wrap items-center gap-1.5 px-2.5 pb-2.5">
              <label className="icon-btn h-9 w-9 shrink-0 cursor-pointer" title="Attach files or images">
                📎
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files && onFiles(e.target.files)}
                />
              </label>
              {speechSupported && (
                <button
                  onClick={toggleMic}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm transition-colors ${listening ? 'animate-pulse border-red-400 bg-red-500/10 text-red-500' : 'border-surface-300 text-surface-500 hover:border-accent-500 hover:text-accent-600 dark:border-surface-600 dark:text-surface-300'}`}
                  title={listening ? 'Stop voice input' : 'Speak — voice input'}
                >
                  🎤
                </button>
              )}
              <button
                onClick={() =>
                  setSafeMode((v) => {
                    localStorage.setItem('infora-safe-mode', v ? '0' : '1');
                    return !v;
                  })
                }
                className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${safeMode ? 'border-accent-500 bg-accent-500/10 text-accent-600 dark:text-accent-400' : 'border-surface-300 text-surface-500 dark:border-surface-600 dark:text-surface-300'}`}
                title="Safe Mode: review the estimated credits before every send"
              >
                🛡 Safe
              </button>
              <button
                onClick={() => {
                  if (!agentMode && !window.confirm('Turn on Agent mode? The AI can search the web and read pages to complete bigger tasks (uses more credits).')) return;
                  setAgentMode((v) => !v);
                }}
                className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${agentMode ? 'border-accent-500 bg-accent-500/10 text-accent-600 dark:text-accent-400' : 'border-surface-300 text-surface-500 dark:border-surface-600 dark:text-surface-300'}`}
                title="Agent mode: AI can search the web and read pages to complete tasks"
              >
                ⚡ Agent
              </button>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                {streaming ? (
                  <button onClick={stop} className="rounded-full border border-red-300 px-4 py-1.5 text-sm text-red-500 dark:border-red-800">■ Stop</button>
                ) : (
                  <button
                    onClick={() => send()}
                    disabled={!input.trim() && !images.length}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-500 text-white shadow transition-transform hover:scale-105 disabled:opacity-40"
                    title="Send"
                  >
                    ↑
                  </button>
                )}
              </div>
            </div>
          </div>'''),
])

# ---------- 6. new ModelPicker ----------
NEW_PICKER = r'''import { useMemo, useRef, useState } from 'react';
import { useModels } from '../../hooks/useSession';

interface ModelRow {
  id: string;
  name: string;
  reasoning?: boolean;
  vision?: boolean;
  input_price_per_1m?: number | null;
}

const PREMIUM = [
  { id: 'deepseek/deepseek-v3.1', label: 'DeepSeek V3.1', note: 'Deepest thinking — code, analysis, reports' },
  { id: 'openai/gpt-5.6-luna', label: 'GPT-5.6 Luna', note: 'Balanced flagship' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini', note: 'Fast everyday workhorse' },
  { id: 'anthropic/claude-3.5-haiku-20241022', label: 'Claude Haiku', note: 'Sharp writing & summaries' },
];

const FAST = [
  { id: 'google/gemma-3-27b-it', label: 'Gemma 3 27B', note: 'Fast & light' },
  { id: 'mistralai/mistral-nemo', label: 'Mistral Nemo', note: 'Fast & light' },
];

function priceLabel(p?: number | null) {
  return typeof p === 'number' ? `$${p < 1 ? p.toFixed(3) : p.toFixed(2)}/M` : '';
}

function PickerRow({
  active,
  onClick,
  label,
  note,
  right,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  note?: string;
  right?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-100 dark:hover:bg-surface-800 ${
        active ? 'bg-accent-500/10' : ''
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{label}</span>
        {note && <span className="block truncate text-[11px] text-surface-400">{note}</span>}
      </span>
      {right && <span className="shrink-0 text-[10px] text-surface-400">{right}</span>}
      {active && <span className="shrink-0 text-xs text-accent-500">✓</span>}
    </button>
  );
}

export default function ModelPicker({
  value,
  onChange,
  founder,
}: {
  value: string;
  onChange: (v: string) => void;
  founder?: boolean;
}) {
  const { data } = useModels();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const models: ModelRow[] = data?.models ?? [];

  const label =
    value === 'best'
      ? '⚡ The Best'
      : value === 'free'
        ? '🆓 Free'
        : models.find((m) => m.id === value)?.name ?? (value ? value.split('/').pop()! : 'The Best');

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !founder) return [];
    return models
      .filter((m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
      .slice(0, 40);
  }, [models, query, founder]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex max-w-[150px] items-center gap-1.5 rounded-full border border-surface-300 px-3 py-1.5 text-xs font-medium hover:border-accent-500 dark:border-surface-600"
        title="Choose model"
      >
        <span className="truncate">{label}</span>
        <span className="text-surface-400">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => { setOpen(false); setQuery(''); }} />
          <div className="card absolute right-0 z-40 mt-2 w-[min(92vw,360px)] animate-fade-up overflow-hidden">
            <div className="max-h-[56vh] overflow-y-auto">
              <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-surface-400">Recommended</p>
              <PickerRow active={value === 'best'} onClick={() => pick('best')} label="⚡ The Best" note="Auto-picks the smartest model for each message" />
              {founder && (
                <PickerRow active={value === 'free'} onClick={() => pick('free')} label="🆓 Free" note="Fastest — never costs a credit" />
              )}
              {!founder && (
                <p className="px-3 py-2 text-[11px] text-surface-400">
                  Pro & Power plans unlock direct model choice. Everything else stays the same.
                </p>
              )}
              {founder && (
                <>
                  <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-surface-400">Premium</p>
                  {PREMIUM.map((m) => (
                    <PickerRow
                      key={m.id}
                      active={value === m.id}
                      onClick={() => pick(m.id)}
                      label={m.label}
                      note={m.note}
                      right={priceLabel(models.find((x) => x.id === m.id)?.input_price_per_1m)}
                    />
                  ))}
                  <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-surface-400">Fast & light</p>
                  {FAST.map((m) => (
                    <PickerRow key={m.id} active={value === m.id} onClick={() => pick(m.id)} label={m.label} note={m.note} />
                  ))}
                </>
              )}
            </div>
            {founder && (
              <div className="border-t border-surface-200 p-2 dark:border-surface-800">
                <input
                  className="input"
                  placeholder="Search all models…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <div className="mt-1 max-h-[36vh] overflow-y-auto">
                    {searchResults.map((m) => (
                      <PickerRow
                        key={m.id}
                        active={m.id === value}
                        onClick={() => pick(m.id)}
                        label={m.name}
                        note={m.id}
                        right={priceLabel(m.input_price_per_1m)}
                      />
                    ))}
                    {searchResults.length === 0 && (
                      <p className="px-3 py-4 text-center text-xs text-surface-400">No models match</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
'''
open(f'{root}/src/components/chat/ModelPicker.tsx', 'w').write(NEW_PICKER)
print('wrote ModelPicker.tsx')

print('Update 13 complete')
