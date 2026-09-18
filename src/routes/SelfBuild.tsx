import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type BuildReq = {
  id: string;
  request: string;
  plan: string | null;
  status: string;
  created_at: string;
};

const STATUS_STYLES: Record<string, string> = {
  planned: 'bg-slate-500/15 text-slate-600 dark:text-slate-300',
  approved: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  building: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  done: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  rejected: 'bg-red-500/15 text-red-500',
};

export default function SelfBuild() {
  const [founder, setFounder] = useState<boolean | null>(null);
  const [request, setRequest] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState<BuildReq[]>([]);

  const loadList = async () => {
    const { data, error: e } = await supabase.functions.invoke('selfbuild', { body: { action: 'list' } });
    if (!e && data && Array.isArray(data.requests)) setItems(data.requests);
  };

  useEffect(() => {
    supabase.functions
      .invoke('video', { body: { action: 'balance' } })
      .then(({ data }) => setFounder(!!(data && data.founder)))
      .catch(() => setFounder(false));
    loadList();
  }, []);

  const handlePlan = async () => {
    const text = request.trim();
    if (!text || busy) return;
    setBusy(true);
    setError('');
    const { data, error: e } = await supabase.functions.invoke('selfbuild', { body: { action: 'plan', request: text } });
    setBusy(false);
    if (e || !data || data.error) {
      setError((e && e.message) || (data && data.error) || 'Something went wrong');
      return;
    }
    setRequest('');
    loadList();
  };

  const setStatus = async (id: string, status: string) => {
    await supabase.functions.invoke('selfbuild', { body: { action: 'update_status', id, status } });
    loadList();
  };

  if (founder === null) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
      </div>
    );
  }

  if (!founder) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <div className="rounded-2xl border border-surface-200 bg-surface-50 p-8 text-center dark:border-surface-800 dark:bg-surface-900">
          <div className="text-4xl">🛠️</div>
          <h1 className="mt-3 text-lg font-semibold">Self Build</h1>
          <p className="mt-2 text-sm text-surface-500 dark:text-surface-400">
            This section is for founder accounts only.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="flex items-center gap-3">
        <span className="text-2xl">🛠️</span>
        <div>
          <h1 className="text-xl font-bold">Self Build</h1>
          <p className="text-sm text-surface-500 dark:text-surface-400">
            Describe a feature — Infora's architect AI plans it, then it gets built.
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-surface-200 bg-surface-50 p-4 dark:border-surface-800 dark:bg-surface-900">
        <textarea
          className="input min-h-24 w-full"
          placeholder="e.g. Add voice replies to chat, so answers can be read out loud"
          value={request}
          onChange={(e) => setRequest(e.target.value)}
        />
        {error ? <p className="mt-2 text-sm text-red-500">{error}</p> : null}
        <button onClick={handlePlan} disabled={busy || !request.trim()} className="btn-primary mt-3">
          {busy ? 'Planning…' : '⚡ Plan this feature'}
        </button>
        <p className="mt-2 text-xs text-surface-400">
          The AI architect writes an implementation plan. Approved requests get built into the platform.
        </p>
      </div>

      <div className="mt-8 space-y-3">
        {items.map((r) => (
          <div key={r.id} className="rounded-2xl border border-surface-200 bg-surface-50 p-4 dark:border-surface-800 dark:bg-surface-900">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium">{r.request}</p>
              <span className={'shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ' + (STATUS_STYLES[r.status] || STATUS_STYLES.planned)}>
                {r.status}
              </span>
            </div>
            {r.plan ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-medium text-primary">View AI plan</summary>
                <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-surface-100 p-3 text-xs dark:bg-surface-800">{r.plan}</pre>
              </details>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {r.status === 'planned' ? (
                <button onClick={() => setStatus(r.id, 'approved')} className="btn-secondary text-xs">✅ Approve</button>
              ) : null}
              {r.status === 'approved' ? (
                <button onClick={() => setStatus(r.id, 'building')} className="btn-secondary text-xs">🔧 Mark building</button>
              ) : null}
              {r.status === 'building' ? (
                <button onClick={() => setStatus(r.id, 'done')} className="btn-secondary text-xs">🏁 Mark done</button>
              ) : null}
              {r.status !== 'rejected' && r.status !== 'done' ? (
                <button onClick={() => setStatus(r.id, 'rejected')} className="btn-secondary text-xs">✕ Reject</button>
              ) : null}
            </div>
          </div>
        ))}
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-surface-400">No build requests yet — describe your first feature above.</p>
        ) : null}
      </div>
    </div>
  );
}
