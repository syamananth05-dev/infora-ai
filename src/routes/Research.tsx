import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSession } from '../hooks/useSession';

interface Citation { title: string; url: string }
interface ReportRow { id: string; topic: string; content: string | null; status: string; citations: Citation[] | null; created_at: string }

export default function Research() {
  const { session } = useSession();
  const qc = useQueryClient();
  const [question, setQuestion] = useState('');
  const [tier, setTier] = useState<'free' | 'paid'>('free');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ id: string; content: string; citations: Citation[] } | null>(null);
  const [error, setError] = useState('');
  const [shareUrl, setShareUrl] = useState('');

  const { data: past = [] } = useQuery({
    queryKey: ['research_reports'],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from('research_reports').select('*').order('created_at', { ascending: false }).limit(5);
      if (error) throw error;
      return data as ReportRow[];
    },
  });

  const run = async () => {
    if (busy || !question.trim()) return;
    setBusy(true);
    setError('');
    setResult(null);
    setShareUrl('');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('research', { body: { question: question.trim(), tier } });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setResult({ id: data.id, content: data.content, citations: data.citations || [] });
      qc.invalidateQueries({ queryKey: ['research_reports'] });
    } catch (e: any) {
      setError(e?.message || 'Research failed');
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!result) return;
    try {
      const { error: fnError } = await supabase.functions.invoke('research', { body: { action: 'share', id: result.id, share: true } });
      if (fnError) throw fnError;
      const url = `${window.location.origin}${import.meta.env.BASE_URL}r/${result.id}`;
      setShareUrl(url);
      try { await navigator.clipboard.writeText(url); } catch {}
    } catch (e: any) {
      window.alert('Could not share: ' + (e?.message || 'error'));
    }
  };

  const viewPast = (r: ReportRow) => {
    if (r.status !== 'done') return;
    setResult({ id: r.id, content: r.content || '', citations: (r.citations as any) || [] });
    setShareUrl('');
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold">🔭 Deep Research</h1>
      <p className="mt-1 text-sm text-surface-500">
        Infora plans searches, reads up to 6 pages across the web, and writes a fully-cited report. Takes 1-3 minutes.
      </p>

      <div className="mt-4 rounded-xl border border-surface-200 bg-surface-50 p-4 dark:border-surface-800 dark:bg-surface-900">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          placeholder="e.g. What are the best low-cost marketing channels for Indian SaaS startups in 2026?"
          className="input w-full"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-xs text-surface-400">Engine</span>
            <select value={tier} onChange={(e) => setTier(e.target.value as 'free' | 'paid')} className="input w-auto py-1.5 text-sm">
              <option value="free">Infora Level 1 (free)</option>
              <option value="paid">Infora Level 3 (premium)</option>
            </select>
          </label>
        </div>

        <button onClick={run} disabled={busy || !question.trim()} className="btn-primary mt-3">
          {busy ? 'Researching deeply (1-3 min)…' : 'Start deep research'}
        </button>
      </div>

      {error ? <p className="mt-4 text-sm text-red-500">{error}</p> : null}

      {busy ? (
        <div className="mt-4 animate-pulse rounded-lg border border-surface-200 p-4 text-sm text-surface-400 dark:border-surface-800">
          Planning sub-questions… searching the web… reading pages… writing your report…
        </div>
      ) : null}

      {result ? (
        <div className="mt-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium uppercase tracking-wider text-surface-400">Report</h2>
            <button onClick={share} className="rounded px-2 py-1 text-xs text-surface-400 hover:text-primary">
              🔗 Share public link
            </button>
          </div>
          {shareUrl ? (
            <p className="mt-1 break-all rounded bg-primary/10 p-2 text-xs text-primary">{shareUrl}</p>
          ) : null}
          <div className="prose prose-sm mt-2 max-w-none whitespace-pre-wrap rounded-lg border border-surface-200 bg-surface-50 p-4 text-sm dark:border-surface-800 dark:bg-surface-900">
            {result.content}
          </div>
          {result.citations?.length ? (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-surface-400">Sources</p>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-xs">
                {result.citations.map((c, i) => (
                  <li key={i}>
                    <a href={c.url} target="_blank" rel="noreferrer" className="break-all text-primary hover:underline">{c.title || c.url}</a>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      ) : null}

      {past.length > 0 ? (
        <div className="mt-6">
          <h2 className="text-sm font-medium uppercase tracking-wider text-surface-400">Recent reports</h2>
          <ul className="mt-2 space-y-1">
            {past.map((r) => (
              <li key={r.id}>
                <button onClick={() => viewPast(r)} className="text-left text-sm text-surface-400 hover:text-primary">
                  {r.status === 'done' ? '📄' : r.status === 'running' ? '⏳' : '❌'} {r.topic} · {new Date(r.created_at).toLocaleDateString()}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
