import { useState } from 'react';
import { supabase } from '../lib/supabase';

interface Answer {
  model: string;
  content: string;
  ok: boolean;
}

export default function Council() {
  const [question, setQuestion] = useState('');
  const [size, setSize] = useState(7);
  const [tier, setTier] = useState<'free' | 'paid'>('free');
  const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [synthesis, setSynthesis] = useState('');
  const [error, setError] = useState('');

  const run = async () => {
    if (busy || !question.trim()) return;
    setBusy(true);
    setError('');
    setAnswers([]);
    setSynthesis('');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('council', {
        body: { question: question.trim(), size, tier },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setAnswers(Array.isArray(data?.answers) ? data.answers : []);
      setSynthesis(data?.synthesis || '');
    } catch (e: any) {
      setError(e?.message || 'Council failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold">⚖️ Model Council</h1>
      <p className="mt-1 text-sm text-surface-500">
        {size} AI models answer your question in parallel, then a merged best answer is written. Agreement = confidence.
      </p>

      <div className="mt-4 rounded-xl border border-surface-200 bg-surface-50 p-4 dark:border-surface-800 dark:bg-surface-900">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          placeholder="Your question for the council..."
          className="input w-full"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-xs text-surface-400">Council size</span>
            <select value={size} onChange={(e) => setSize(Number(e.target.value))} className="input w-auto py-1.5 text-sm">
              <option value={5}>5 members</option>
              <option value={7}>7 members</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-xs text-surface-400">Tier</span>
            <select value={tier} onChange={(e) => setTier(e.target.value as 'free' | 'paid')} className="input w-auto py-1.5 text-sm">
              <option value="free">Free (₹0 — free models)</option>
              <option value="paid">Paid (premium models)</option>
            </select>
          </label>
        </div>
        <p className="mt-2 text-xs text-surface-400">
          {tier === 'free'
            ? 'Free tier runs on free AI models — no cost, subject to daily limits.'
            : 'Paid tier uses premium models and consumes credits from the platform AI account.'}
        </p>
        <button onClick={run} disabled={busy || !question.trim()} className="btn-primary mt-3">
          {busy ? 'Council in session…' : `Convene ${size}-member council`}
        </button>
      </div>

      {error ? <p className="mt-4 text-sm text-red-500">{error}</p> : null}

      {answers.length > 0 ? (
        <div className="mt-6 space-y-3">
          {answers.map((a) => (
            <div key={a.model} className="rounded-lg border border-surface-200 bg-surface-50 p-3 dark:border-surface-800 dark:bg-surface-900">
              <p className="text-xs font-semibold uppercase tracking-wider text-surface-400">{a.model}</p>
              <div className="prose prose-sm mt-2 max-w-none whitespace-pre-wrap text-sm">{a.content}</div>
            </div>
          ))}
        </div>
      ) : null}

      {synthesis ? (
        <div className="mt-4 rounded-lg border-2 border-primary/50 bg-surface-50 p-3 dark:border-primary/60 dark:bg-surface-900">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">⚖️ Council verdict (merged)</p>
          <div className="prose prose-sm mt-2 max-w-none whitespace-pre-wrap text-sm">{synthesis}</div>
        </div>
      ) : null}
    </div>
  );
}
