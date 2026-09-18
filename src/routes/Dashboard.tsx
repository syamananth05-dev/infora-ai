import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useConversations, useProjects } from '../hooks/useData';
import { useSession } from '../hooks/useSession';
import { timeAgo, formatCost, formatTokens } from '../lib/types';
import { useEffect, useState } from 'react';

export default function Dashboard() {

  const [liveMsgs, setLiveMsgs] = useState(0);
  const [liveChats, setLiveChats] = useState(0);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const start = new Date(); start.setHours(0, 0, 0, 0);
        const m = await supabase.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', start.toISOString());
        const c = await supabase.from('conversations').select('id', { count: 'exact', head: true }).gte('created_at', start.toISOString());
        if (alive) { setLiveMsgs(m.count ?? 0); setLiveChats(c.count ?? 0); }
      } catch {}
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const { session } = useSession();
  const { data: convos = [] } = useConversations();
  const { data: projects = [] } = useProjects();

  const { data: usage } = useQuery({
    queryKey: ['usage-totals'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_team_usage_totals');
      if (error) throw error;
      return data as {
        total_requests: number;
        total_cost: number;
        total_tokens_in: number;
        total_tokens_out: number;
        requests_24h: number;
        cost_24h: number;
        active_users: number;
      };
    },
  });

  const name = session?.user?.user_metadata?.full_name || session?.user?.email?.split('@')[0] || 'there';

  return (
    <div className="mx-auto max-w-4xl p-6 sm:p-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {name}</h1>
        <p className="mt-1 text-sm text-surface-500">Your team's shared AI workspace.</p>
      </header>

      {/* Quick actions */}
      <div className="mb-8 flex flex-wrap gap-3">
        <Link to="/chat" className="btn-primary px-4 py-2.5">＋ New chat</Link>
        <Link to="/projects" className="btn-outline px-4 py-2.5">📁 New project</Link>
      </div>

      {/* Usage */}
      {usage && (
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Team requests (24h)" value={String(usage.requests_24h)} />
          <Stat label="Tokens in" value={formatTokens(usage.total_tokens_in)} />
          <Stat label="Tokens out" value={formatTokens(usage.total_tokens_out)} />
          <Stat label="Team est. spend" value={formatCost(usage.total_cost)} />
          <Stat label="Active members" value={String(usage.active_users ?? 0)} />
        </div>
      )}

      <div className="mb-8 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
            </span>
            <h2 className="text-sm font-semibold">Live activity today</h2>
          </div>
          <span className="text-xs text-surface-400">updates every 30s</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div><p className="text-2xl font-bold">{liveMsgs}</p><p className="text-xs text-surface-400">messages sent</p></div>
          <div><p className="text-2xl font-bold">{liveChats}</p><p className="text-xs text-surface-400">chats started</p></div>
        </div>
      </div>

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
