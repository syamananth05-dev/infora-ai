import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useConversations, useProjects } from '../hooks/useData';
import { useSession } from '../hooks/useSession';
import { useUIStore, useThemeStore } from '../lib/stores';
import { supabase } from '../lib/supabase';
import { timeAgo } from '../lib/types';
import type { Conversation } from '../lib/types';
import CreditsChip from './CreditsChip';

function groupByDate(items: Conversation[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const sevenDays = new Date(today.getTime() - 7 * 86400000);
  const thirtyDays = new Date(today.getTime() - 30 * 86400000);
  const groups: Record<string, { label: string; items: Conversation[] }> = {
    Today: { label: 'Today', items: [] },
    Yesterday: { label: 'Yesterday', items: [] },
    'Previous 7 days': { label: 'Previous 7 days', items: [] },
    'Previous 30 days': { label: 'Previous 30 days', items: [] },
    Older: { label: 'Older', items: [] },
  };
  for (const c of items) {
    const d = new Date(c.updated_at);
    if (d >= today) groups.Today.items.push(c);
    else if (d >= yesterday) groups.Yesterday.items.push(c);
    else if (d >= sevenDays) groups['Previous 7 days'].items.push(c);
    else if (d >= thirtyDays) groups['Previous 30 days'].items.push(c);
    else groups.Older.items.push(c);
  }
  return Object.values(groups).filter((g) => g.items.length);
}

const NavLink = ({ to, label, icon }: { to: string; label: string; icon: string }) => {
  const { pathname } = useLocation();
  const { setSidebar } = useUIStore();
  const active = pathname === to;
  return (
    <Link
      to={to}
      onClick={() => { if (window.innerWidth < 768) setSidebar(false); }}
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
        active
          ? 'bg-accent-600/10 font-medium text-accent-700 dark:text-accent-300'
          : 'text-surface-600 hover:bg-surface-100 dark:text-surface-300 dark:hover:bg-surface-800'
      }`}
    >
      <span className="text-base leading-none">{icon}</span>
      {label}
    </Link>
  );
};

export default function Sidebar() {
  const { sidebarOpen, setSidebar, toggleSidebar } = useUIStore();
  const { theme, toggle } = useThemeStore();
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: convos = [] } = useConversations();
  const { data: projects = [] } = useProjects();
  const { session } = useSession();
  const location = useLocation();

  const filtered = search
    ? convos.filter((c) => c.title.toLowerCase().includes(search.toLowerCase()))
    : convos;
  const pinned = filtered.filter((c) => c.pinned);
  const rest = filtered.filter((c) => !c.pinned);
  const groups = groupByDate(rest);

  const handleNewChat = () => {
    navigate('/chat');
    if (window.innerWidth < 768) setSidebar(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    qc.clear();
    navigate('/auth');
  };

  const handleDeleteConv = async (c: Conversation) => {
    if (!window.confirm(`Delete "${c.title}"? Its messages will be deleted too.`)) return;
    const { error } = await supabase.from('conversations').delete().eq('id', c.id);
    if (error) { window.alert('Could not delete this chat: ' + error.message); return; }
    qc.invalidateQueries({ queryKey: ['conversations'] });
    if (location.pathname === `/chat/${c.id}`) navigate('/chat');
  };

  const activeChat = location.pathname.startsWith('/chat/');

  const [isFounder, setIsFounder] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.rpc('credit_summary');
        if (data && (data as any).founder) setIsFounder(true);
      } catch {}
    })();
  }, []);

  const content = (
    <div className="flex h-full w-[264px] flex-col border-r border-surface-200 bg-surface-50 dark:border-surface-800 dark:bg-surface-900">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3">
        <Link to="/dashboard" className="flex items-center gap-2">
          <svg width="22" height="22" viewBox="0 0 32 32" className="shrink-0">
            <circle cx="16" cy="16" r="13" fill="none" stroke="#ff7a1a" strokeWidth="3" />
            <circle cx="16" cy="16" r="5" fill="#ff7a1a" />
          </svg>
          <span className="font-semibold tracking-tight">Infora AI</span>
        </Link>
        <button onClick={toggleSidebar} className="icon-btn" aria-label="Toggle sidebar" title="Toggle sidebar">
          ☰
        </button>
      </div>

      {/* New chat */}
      <div className="px-3">
        <button onClick={handleNewChat} className="btn-primary w-full justify-start gap-2">
          <span className="text-base leading-none">＋</span> New chat
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pt-2">
        <input
          className="input"
          placeholder="Search conversations…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Nav */}
      <div className="space-y-0.5 px-3 py-2">
        <CreditsChip />
        <NavLink to="/projects" label="Projects" icon="📁" />
        {isFounder && <NavLink to="/selfbuild" label="Self Build" icon="🛠️" />}
        <NavLink to="/knowledge" label="Knowledge" icon="🧠" />
        <NavLink to="/council" label="Council" icon="⚖️" />
        <NavLink to="/analytics" label="Analytics" icon="📊" />
        <NavLink to="/tasks" label="Tasks" icon="⏰" />
        <NavLink to="/research" label="Research" icon="🔭" />
        <NavLink to="/studio" label="Studio" icon="📄" />
        <NavLink to="/image" label="Image" icon="🎨" />
        <NavLink to="/settings" label="Settings" icon="⚙" />
      </div>

      {/* Conversation list */}
      <div className="mt-1 flex-1 overflow-y-auto px-2 pb-2">
        {pinned.length > 0 && (
          <Section label="Pinned">
            {pinned.map((c) => (
              <ConvItem key={c.id} conv={c} active={activeChat && location.pathname === `/chat/${c.id}`} onClose={setSidebar} onDelete={handleDeleteConv} />
            ))}
          </Section>
        )}
        {groups.map((g) => (
          <Section key={g.label} label={g.label}>
            {g.items.map((c) => (
              <ConvItem key={c.id} conv={c} active={activeChat && location.pathname === `/chat/${c.id}`} onClose={setSidebar} onDelete={handleDeleteConv} />
            ))}
          </Section>
        ))}
        {filtered.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-surface-400">No conversations yet</p>
        )}
      </div>

      {/* Projects quick */}
      {projects.length > 0 && (
        <div className="border-t border-surface-200 px-3 py-2 dark:border-surface-800">
          <p className="px-1 pb-1 text-[11px] font-medium uppercase tracking-wider text-surface-400">Projects</p>
          <div className="space-y-0.5">
            {projects.slice(0, 4).map((p) => (
              <Link
                key={p.id}
                to={`/projects/${p.id}`}
                className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-surface-600 hover:bg-surface-100 dark:text-surface-300 dark:hover:bg-surface-800"
              >
                <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                <span className="truncate">{p.name}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* User */}
      <div className="flex items-center justify-between gap-2 border-t border-surface-200 px-3 py-2 dark:border-surface-800">
        <Link to="/settings" className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-600 text-xs font-medium text-white">
            {(session?.user?.email ?? '?')[0].toUpperCase()}
          </div>
          <span className="truncate text-xs text-surface-500">{session?.user?.email}</span>
        </Link>
        <button onClick={toggle} className="icon-btn" title="Toggle theme" aria-label="Toggle theme">
          {theme === 'dark' ? '☀' : '☾'}
        </button>
        <button onClick={handleSignOut} className="icon-btn" title="Sign out" aria-label="Sign out">
          ⎋
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <aside className={`hidden shrink-0 overflow-hidden transition-all duration-200 md:block ${sidebarOpen ? 'w-[264px]' : 'w-0'}`}>{content}</aside>

      {/* Mobile drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebar(false)} />
          <div className="absolute left-0 top-0 h-full animate-slide-in">{content}</div>
        </div>
      )}
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <p className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-surface-400">{label}</p>
      {children}
    </div>
  );
}

function ConvItem({
  conv,
  active,
  onClose,
  onDelete,
}: {
  conv: Conversation;
  active: boolean;
  onClose: (o: boolean) => void;
  onDelete: (c: Conversation) => void;
}) {
  return (
    <Link
      to={`/chat/${conv.id}`}
      onClick={() => onClose(false)}
      className={`group flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
        active
          ? 'bg-surface-200/70 font-medium dark:bg-surface-800'
          : 'text-surface-600 hover:bg-surface-100 dark:text-surface-300 dark:hover:bg-surface-800'
    }`}
    >
      {conv.pinned && <span className="text-[10px] text-accent-500">★</span>}
      <span className="truncate">{conv.title}</span>
      <span className="ml-auto hidden shrink-0 text-[10px] text-surface-400 group-hover:hidden sm:block">{timeAgo(conv.updated_at)}</span>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(conv); }}
        className="shrink-0 rounded px-1 py-0.5 text-xs text-surface-400 hover:bg-red-500/10 hover:text-red-500"
        title="Delete chat"
        aria-label="Delete chat"
      >
        🗑
      </button>
    </Link>
  );
}
