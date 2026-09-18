import { useState } from 'react';
import { supabase } from '../lib/supabase';

const MODELS = [
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini (OpenAI)' },
  { id: 'deepseek/deepseek-chat', label: 'DeepSeek Chat' },
  { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' },
  { id: 'google/gemini-flash-1.5', label: 'Gemini Flash 1.5' },
  { id: 'qwen/qwen-2.5-72b-instruct', label: 'Qwen 2.5 72B' },
  { id: 'mistralai/mistral-small', label: 'Mistral Small' },
];

interface Answer {
  model: string;
  content: string;
  ok: boolean;
}

export default function Council() {
  const [question, setQuestion] = useState('');
  const [selected, setSelected] = useState<string[]>([MODELS[0].id, MODELS[1].id]);
  const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [synthesis, setSynthesis] = useState('');
  const [error, setError] = useState('');

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : prev.length >= 3 ? prev : [...prev, id]
    );
  };

  const run = async () => {
    if (busy || !question.trim() || selected.length === 0) return;
    setBusy(true);
    setError('');
    setAnswers([]);
    setSynthesis('');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('council', {
        body: { question: question.trim(), models: selected },
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
        Ask up to 3 AI models the same question, then get a merged best answer. Agreement = confidence.
      </p>

      <div className="mt-4 rounded-xl border border-surface-200 bg-surface-50 p-4 dark:border-surface-800 dark:bg-surface-900">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          placeholder="Your question for the council..."
          className="input w-full"
        />
        <p className="mt-3 text-xs text-surface-400">Pick 2-3 models:</p>
        <div className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
          {MODELS.map((m) => (
            <label key={m.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(m.id)}
                onChange={() => toggle(m.id)}
              />
              {m.label}
            </label>
          ))}
        </div>
        <button onClick={run} disabled={busy || !question.trim() || selected.length === 0} className="btn-primary mt-3">
          {busy ? 'Council in session…' : `Convene council (${selected.length})`}
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
