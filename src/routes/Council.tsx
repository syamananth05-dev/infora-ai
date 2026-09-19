import { useState } from 'react';
import { supabase } from '../lib/supabase';

const PERSONAS = [
  { id: 'deep_research', name: 'Deep Research Expert', emoji: '🔭' },
  { id: 'problem_solving', name: 'Problem-Solving Strategist', emoji: '🧩' },
  { id: 'business', name: 'Business Analyst', emoji: '📊' },
  { id: 'coding', name: 'Coding Architect', emoji: '💻' },
  { id: 'data_science', name: 'Data Scientist', emoji: '📈' },
  { id: 'math', name: 'Math Genius', emoji: '🧮' },
  { id: 'creative', name: 'Creative Writer', emoji: '✍️' },
  { id: 'legal', name: 'Legal Advisor', emoji: '⚖️' },
  { id: 'finance', name: 'Finance Expert', emoji: '💰' },
  { id: 'marketing', name: 'Marketing Strategist', emoji: '📣' },
  { id: 'science', name: 'Scientific Analyst', emoji: '🔬' },
  { id: 'history', name: 'History Scholar', emoji: '📜' },
  { id: 'medical', name: 'Medical Information Expert', emoji: '🩺' },
  { id: 'career', name: 'Career Counselor', emoji: '🧭' },
  { id: 'psychology', name: 'Psychologist & Coach', emoji: '🧠' },
  { id: 'skeptic', name: "Devil's Advocate", emoji: '🎭' },
  { id: 'teacher', name: 'Teacher & Explainer', emoji: '👨‍🏫' },
  { id: 'linguist', name: 'Translator & Languist', emoji: '🌍' },
  { id: 'tech_trends', name: 'Tech Trend Analyst', emoji: '🚀' },
  { id: 'editor', name: 'Essay Editor', emoji: '📝' },
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

    const shareCouncil = async () => {
      const messages = [
        ...answers.map((a) => ({ role: `${a.emoji} ${a.persona}`, content: a.content })),
        ...(summary ? [{ role: '🏛︌ Council Summary', content: summary }] : []),
      ];
    if (!messages.length) return;
      const { data, error: err } = await supabase.rpc('create_shared_link', {
        p_title: question.trim().slice(0, 80) || 'Council session',
        p_messages: { messages },
      });
      if (err || !data) {
        alert('Could not create share link.');
        return;
      }
      const url = `${window.location.origin}${import.meta.env.BASE_URL}s/${data}`;
      try { await navigator.clipboard.writeText(url); } catch {}
      alert(`Share link copied:\n${url}`);
    };
  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <h1 className="text-2xl font-bold">⚖️ Council</h1>
      <p className="mt-1 text-sm text-surface-500">
        Pick 1–7 subject-matter experts. They answer independently, then the chair writes one merged summary.
      </p>

      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Ask your council anything…"
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
        {busy ? 'Council in session…' : `Convene ${seats}-member council`}
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
          <h3 className="text-base font-bold text-primary">🏛️ Council Summary</h3>
          <div className="mt-2 whitespace-pre-wrap text-sm">{summary}</div>
        </div>
      )}

      {(answers.length > 0 || summary) && !busy && (
        <button onClick={shareCouncil} className="btn-primary mt-4">🔗 Share this council session</button>
      )}
      {charged !== null && !busy && (
        <p className="mt-3 text-xs text-surface-400">Charged {charged} credits for this session.</p>
      )}
    </div>
  );
}
