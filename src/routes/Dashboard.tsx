import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useConversations, useProjects } from '../hooks/useData';
import { useSession } from '../hooks/useSession';
import { timeAgo, formatCost, formatTokens } from '../lib/types';

export default function Dashboard() {
  const { session } = useSession();
  const { data: convos = [] } = useConversations();
  const { data: projects = [] } = useProjects();

  const { data: usage } = useQuery({
    queryKey: ['usage-totals'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_usage_totals');
      if (error) throw error;
      return data as {
        total_requests: number;
        total_cost: number;
        total_tokens_in: number;
        total_tokens_out: number;
        requests_24h: number;
        cost_30d: number;
    },
  });

  const name = session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0] || 'there';

  return (
    <div className="mx-auto max-w-4xl p-6 sm:p-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {name}</h1>
        <p className="mt-1 text-sm text-surface-500">Here's what's happening in your workspace.</p>
      </header>

      {/* Quick actions */}
      <div className="mb-8 flex flex-wrap gap-3">
        <Link to="/chat" className="btn-primary px-4 py-2.5">＋ New chat</Link>
        <Link to="/projects" className="btn-outline px-4 py-2.5">📁 New project</Link>
      </div>

      {/* Usage */}
      {usage && (
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Requests (24h)" value={String(usage.requests_24h)} />
          <Stat label="Tokens in" value={formatTokens(usage.total_tokens_in)} />
          <Stat label="Tokens out" value={formatTokens(usage.total_tokens_out)} />
          <Stat label="Est. spend" value={formatCost(usage.total_cost)} />
        </div>
      )}

      <div className="grid gap-8 md:grid-cols-2">
        {/* Recent conversations */}
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-surface-400">Recent conversations</h2>
          <div className="card divide-y divide-surface-100 dark:divide-surface-800">
            {convos.slice(0, 6).map((c) => (
              <Link
                key={c.id}
                to={`/chat/${c.id}`}
                className="flex items-center justify-between px-4 py-3 text-sm transition-colors hover:bg-surface-50 dark:hover:bg-surface-800/60"
              >
                <span className="truncate">{c.pinned && '★ '}{c.title}</span>
                <span className="ml-3 shrink-0 text-xs text-surface-400">{timeAgo(c.updated_at)}</span>
              </Link>
            ))}
            {convos.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-surface-400">
                No conversations yet — <Link to="/chat" className="text-accent-600 dark:text-accent-400">start one</Link>
              </div>
            )}
          </div>
        </section>

        {/* Projects */}
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-surface-400">Active projects</h2>
          <div className="card divide-y divide-surface-100 dark:divide-surface-800">
            {projects.slice(0, 6).map((p) => (
              <Link
                key={p.id}
                to={`/projects/${p.id}`}
                className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-surface-50 dark:hover:bg-surface-800/60"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
                <span className="truncate font-medium">{p.name}</span>
                <span className="ml-auto shrink-0 text-xs text-surface-400">{timeAgo(p.updated_at)}</span>
              </Link>
            ))}
            {projects.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-surface-400">
                No projects yet — <Link to="/projects" className="text-accent-600 dark:text-accent-400">create one</Link>
              </div>
            )}
          </div>
        </section>
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
