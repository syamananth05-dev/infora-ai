import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useProfile } from '../hooks/useSession';
import { formatCost, formatTokens } from '../lib/types';

interface AdminUserRow {
  user_id: string;
  email: string;
  display_name: string | null;
  requests: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  last_active: string | null;
}

interface AdminModelRow {
  model: string;
  requests: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
}

export default function Admin() {
  const { data: profile } = useProfile();

  const { data: users, error: usersError } = useQuery({
    queryKey: ['admin-users'],
    enabled: profile?.role === 'admin',
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_usage_by_user');
      if (error) throw error;
      return data as AdminUserRow[];
    },
  });

  const { data: models } = useQuery({
    queryKey: ['admin-models'],
    enabled: profile?.role === 'admin',
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_usage_by_model');
      if (error) throw error;
      return data as AdminModelRow[];
    },
  });

  if (profile && profile.role !== 'admin') {
    return <div className="p-10 text-center text-sm text-surface-400">Admin access required.</div>;
  }

  return (
    <div className="mx-auto max-w-4xl p-6 sm:p-10">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Admin</h1>
      <p className="mb-8 text-sm text-surface-500">
        Aggregated platform usage. Message content is never visible here — only totals.
      </p>

      {usersError && (
        <div className="mb-4 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {String(usersError.message || usersError)}
        </div>
      )}

      {/* Totals */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Users" value={String(users?.length ?? 0)} />
        <Stat label="Total requests" value={String(users?.reduce((a, u) => a + u.requests, 0) ?? 0)} />
        <Stat label="Total tokens" value={formatTokens((users ?? []).reduce((a, u) => a + u.tokens_in + u.tokens_out, 0))} />
        <Stat label="Total spend" value={formatCost((users ?? []).reduce((a, u) => a + Number(u.cost_usd), 0))} />
      </div>

      {/* By user */}
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-surface-400">By user</h2>
      <div className="card mb-8 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-200 text-left text-xs uppercase tracking-wider text-surface-400 dark:border-surface-800">
              <th className="px-4 py-2.5 font-medium">User</th>
              <th className="px-4 py-2.5 font-medium">Requests</th>
              <th className="px-4 py-2.5 font-medium">Tokens</th>
              <th className="px-4 py-2.5 font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map((u) => (
              <tr key={u.user_id} className="border-b border-surface-100 last:border-0 dark:border-surface-800/60">
                <td className="px-4 py-2.5">
                  <div className="font-medium">{u.display_name || '—'}</div>
                  <div className="text-xs text-surface-400">{u.email}</div>
                </td>
                <td className="px-4 py-2.5 tabular-nums">{u.requests}</td>
                <td className="px-4 py-2.5 tabular-nums">{formatTokens(u.tokens_in + u.tokens_out)}</td>
                <td className="px-4 py-2.5 tabular-nums">{formatCost(Number(u.cost_usd))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* By model */}
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-surface-400">By model</h2>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-200 text-left text-xs uppercase tracking-wider text-surface-400 dark:border-surface-800">
              <th className="px-4 py-2.5 font-medium">Model</th>
              <th className="px-4 py-2.5 font-medium">Requests</th>
              <th className="px-4 py-2.5 font-medium">Tokens</th>
              <th className="px-4 py-2.5 font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {(models ?? []).map((m) => (
              <tr key={m.model} className="border-b border-surface-100 last:border-0 dark:border-surface-800/60">
                <td className="px-4 py-2.5 font-mono text-xs">{m.model}</td>
                <td className="px-4 py-2.5 tabular-nums">{m.requests}</td>
                <td className="px-4 py-2.5 tabular-nums">{formatTokens(m.tokens_in + m.tokens_out)}</td>
                <td className="px-4 py-2.5 tabular-nums">{formatCost(Number(m.cost_usd))}</td>
              </tr>
            ))}
            {(models ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-surface-400">No usage recorded yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-surface-400">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
