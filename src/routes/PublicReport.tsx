import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

const EDGE_URL = 'https://qoqemcsmujehkrksswlg.supabase.co/functions/v1/research';

interface Citation { title: string; url: string }

export default function PublicReport() {
  const { id } = useParams();
  const [report, setReport] = useState<{ topic: string; content: string | null; citations: Citation[] | null; created_at: string } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`${EDGE_URL}?id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Report not found'))))
      .then((d) => setReport(d))
      .catch((e: any) => setError(e?.message || 'Report not found'))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <div className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded-full bg-primary" />
        <span className="text-sm font-semibold">Infora AI</span>
        <span className="text-xs text-surface-400">· Deep Research report</span>
      </div>
      {loading ? (
        <p className="mt-6 text-sm text-surface-400">Loading report…</p>
      ) : error ? (
        <p className="mt-6 text-sm text-red-500">{error}</p>
      ) : (
        <div className="mt-4">
          <h1 className="text-lg font-semibold">{report?.topic}</h1>
          <p className="mt-1 text-xs text-surface-400">{report?.created_at ? new Date(report.created_at).toLocaleString() : ''}</p>
          <div className="prose prose-sm mt-4 max-w-none whitespace-pre-wrap rounded-lg border border-surface-200 bg-surface-50 p-4 text-sm dark:border-surface-800 dark:bg-surface-900">
            {report?.content}
          </div>
          {report?.citations?.length ? (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-surface-400">Sources</p>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-xs">
                {report.citations.map((c, i) => (
                  <li key={i}>
                    <a href={c.url} target="_blank" rel="noreferrer" className="break-all text-primary hover:underline">{c.title || c.url}</a>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          <a href="../" className="mt-6 inline-block text-sm text-primary hover:underline">✦ Make your own with Infora AI — free</a>
        </div>
      )}
    </div>
  );
}
