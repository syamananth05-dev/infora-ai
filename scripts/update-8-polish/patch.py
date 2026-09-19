import sys

root = sys.argv[1] if len(sys.argv) > 1 else '.'

def patch(path, pairs, allow_missing=False):
    p = f'{root}/{path}'
    s = open(p).read()
    for old, new in pairs:
        n = s.count(old)
        if n != 1:
            if allow_missing and n == 0:
                continue
            raise SystemExit(f'{path}: anchor count={n}: {old[:70]!r}')
        s = s.replace(old, new, 1)
    open(p, 'w').write(s)
    print(f'patched {path}')

# ---------- api.ts: model_selection field ----------
patch('src/lib/api.ts', [
    ("  level?: 1 | 2 | 3;",
     "  level?: 1 | 2 | 3;\n  model_selection?: string;"),
])

# ---------- Chat.tsx ----------
C = 'src/routes/Chat.tsx'
s = open(f'{root}/{C}').read()

# import supabase if missing
if "from '../lib/supabase'" not in s:
    anchor = "import { useModels, useSession } from '../hooks/useSession';"
    assert s.count(anchor) == 1
    s = s.replace(anchor, anchor + "\nimport { supabase } from '../lib/supabase';", 1)

# founder flag + model selection state
anchor = "  const [model, setModel] = useState(defaultModel);"
assert s.count(anchor) == 1
s = s.replace(anchor, anchor + """
  const [founder, setFounder] = useState(false);
  const [modelSelection, setModelSelection] = useState('best');
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.rpc('credit_summary');
        if (data && (data as any).founder) setFounder(true);
      } catch {}
    })();
  }, []);""", 1)

# payload: send model_selection for founders
anchor = """        mode: agentMode ? 'agent' : 'chat',
        model: useModel,"""
assert s.count(anchor) == 1
s = s.replace(anchor, anchor + """
        ...(founder && modelSelection !== 'best' ? { model_selection: modelSelection } : {}),""", 1)

# compact Safe button
anchor = """            <button
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
            </button>"""
assert s.count(anchor) == 1
s = s.replace(anchor, """            <button
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
            </button>""", 1)

# compact Agent button + confirm dialog
anchor = """            <button
              onClick={() => setAgentMode((v) => !v)}
              className={`btn-outline shrink-0 px-3 py-1.5 text-sm ${agentMode ? 'border-accent-500 text-accent-600 dark:text-accent-400' : ''}`}
              title="Agent mode: AI can search the web and read pages to complete tasks"
            >
              ⚡ Agent
            </button>"""
assert s.count(anchor) == 1
s = s.replace(anchor, """            <button
              onClick={() => {
                if (!agentMode && !window.confirm('Turn on Agent mode? The AI can search the web and read pages to complete bigger tasks (uses more credits).')) return;
                setAgentMode((v) => !v);
              }}
              className={`btn-outline shrink-0 px-2.5 py-1.5 text-sm ${agentMode ? 'border-accent-500 text-accent-600 dark:text-accent-400' : ''}`}
              title="Agent mode: AI can search the web and read pages to complete tasks"
            >
              ⚡
            </button>""", 1)

# founder model picker before the mic button
FOUNDER_SELECT = '''            {founder && (
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
'''
anchor = '\n            {speechSupported && ('
assert s.count(anchor) == 1
s = s.replace(anchor, '\n' + FOUNDER_SELECT + '            {speechSupported && (', 1)

# FlightPlanModal: Est. cost -> Est. credits
anchor = """            <p className="text-[10px] text-surface-400">Est. cost</p>
            <p className="text-sm font-semibold tabular-nums">{estCost === 0 ? 'Free' : `$${estCost.toFixed(4)}`}</p>"""
assert s.count(anchor) == 1
s = s.replace(anchor, """            <p className="text-[10px] text-surface-400">Est. credits</p>
            <p className="text-sm font-semibold tabular-nums">{estCost === 0 ? 'Free' : `${Math.max(1, Math.ceil(estCost * 8300))} credits`}</p>""", 1)

open(f'{root}/{C}', 'w').write(s)
print('patched Chat.tsx')

# ---------- Council.tsx: full rewrite (v5) ----------
COUNCIL = r'''import { useState } from 'react';
import { supabase } from '../lib/supabase';

const PERSONAS = [
  { id: 'deep_research', name: 'Deep Research Expert', emoji: '\U0001F52D' },
  { id: 'problem_solving', name: 'Problem-Solving Strategist', emoji: '\U0001F9E9' },
  { id: 'business', name: 'Business Analyst', emoji: '\U0001F4CA' },
  { id: 'coding', name: 'Coding Architect', emoji: '\U0001F4BB' },
  { id: 'data_science', name: 'Data Scientist', emoji: '\U0001F4C8' },
  { id: 'math', name: 'Math Genius', emoji: '\U0001F9EE' },
  { id: 'creative', name: 'Creative Writer', emoji: '\u270D\uFE0F' },
  { id: 'legal', name: 'Legal Advisor', emoji: '\u2696\uFE0F' },
  { id: 'finance', name: 'Finance Expert', emoji: '\U0001F4B0' },
  { id: 'marketing', name: 'Marketing Strategist', emoji: '\U0001F4E3' },
  { id: 'science', name: 'Scientific Analyst', emoji: '\U0001F52C' },
  { id: 'history', name: 'History Scholar', emoji: '\U0001F4DC' },
  { id: 'medical', name: 'Medical Information Expert', emoji: '\U0001FA7A' },
  { id: 'career', name: 'Career Counselor', emoji: '\U0001F9ED' },
  { id: 'psychology', name: 'Psychologist & Coach', emoji: '\U0001F9E0' },
  { id: 'skeptic', name: "Devil's Advocate", emoji: '\U0001F3AD' },
  { id: 'teacher', name: 'Teacher & Explainer', emoji: '\U0001F468\u200D\U0001F3EB' },
  { id: 'linguist', name: 'Translator & Linguist', emoji: '\U0001F30D' },
  { id: 'tech_trends', name: 'Tech Trend Analyst', emoji: '\U0001F680' },
  { id: 'editor', name: 'Essay Editor', emoji: '\U0001F4DD' },
];

interface Answer {
  persona: string;
  emoji: string;
  content: string;
  ok: boolean;
}

export default function Council() {
  const [question, setQuestion] = useState('');
  const [seats, setSeats] = useState(5);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [summary, setSummary] = useState('');
  const [charged, setCharged] = useState<number | null>(null);
  const [error, setError] = useState('');

  const setSeatCount = (n: number) => {
    setSeats(n);
    setPicked((p) => p.slice(0, n));
  };
  const pickPersona = (seat: number, id: string) => {
    setPicked((p) => {
      const c = [...p];
      c[seat] = id;
      return c;
    });
  };

  const run = async () => {
    if (busy || !question.trim()) return;
    setBusy(true);
    setError('');
    setAnswers([]);
    setSummary('');
    setCharged(null);
    try {
      const personas = picked.slice(0, seats).filter(Boolean);
      const { data, error: fnError } = await supabase.functions.invoke('council', {
        body: { question: question.trim(), size: seats, ...(personas.length ? { personas } : {}) },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setAnswers(data.answers ?? []);
      setSummary(data.summary ?? '');
      setCharged(typeof data.credits_charged === 'number' ? data.credits_charged : null);
    } catch (e: any) {
      setError(e?.message || 'Council failed');
    }
    setBusy(false);
  };

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <h1 className="text-2xl font-bold">\u2696\uFE0F Council</h1>
      <p className="mt-1 text-sm text-surface-500">
        Pick 1\u20137 subject-matter experts. They answer independently, then the chair writes one merged summary.
      </p>

      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Ask your council anything\u2026"
        className="input mt-4 min-h-[90px]"
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-xs text-surface-400">Council size</span>
          <select value={seats} onChange={(e) => setSeatCount(Number(e.target.value))} className="input w-auto py-1.5 text-sm">
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? 'member' : 'members'}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {Array.from({ length: seats }).map((_, i) => (
          <label key={i} className="flex items-center gap-2 text-sm">
            <span className="w-14 shrink-0 text-xs text-surface-400">Seat {i + 1}</span>
            <select value={picked[i] ?? ''} onChange={(e) => pickPersona(i, e.target.value)} className="input w-full py-1.5 text-sm">
              <option value="">Auto-assign expert</option>
              {PERSONAS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.emoji} {p.name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <button onClick={run} disabled={busy || !question.trim()} className="btn-primary mt-4">
        {busy ? 'Council in session\u2026' : `Convene ${seats}-member council`}
      </button>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">{error}</p>
      )}

      {answers.length > 0 && (
        <div className="mt-6 space-y-3">
          {answers.map((a, i) => (
            <div key={i} className="card p-4">
              <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-200">
                {a.emoji} {a.persona}
              </h3>
              <div className="mt-2 whitespace-pre-wrap text-sm">{a.content}</div>
            </div>
          ))}
        </div>
      )}

      {summary && (
        <div className="card mt-4 border-primary/40 bg-primary/5 p-4">
          <h3 className="text-base font-bold text-primary">\U0001F3DB\uFE0F Council Summary</h3>
          <div className="mt-2 whitespace-pre-wrap text-sm">{summary}</div>
        </div>
      )}

      {charged !== null && !busy && (
        <p className="mt-3 text-xs text-surface-400">Charged {charged} credits for this session.</p>
      )}
    </div>
  );
}
'''
open(f'{root}/src/routes/Council.tsx', 'w').write(COUNCIL.encode().decode('unicode_escape'))
print('rewrote Council.tsx')

print('Update 8 complete')
