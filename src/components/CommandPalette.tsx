import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUIStore, useThemeStore } from '../lib/stores';
import { useConversations } from '../hooks/useData';
import { useModels } from '../hooks/useSession';

interface Item {
  id: string;
  label: string;
  hint?: string;
  group: string;
  action: () => void;
}

export default function CommandPalette() {
  const { paletteOpen, setPalette } = useUIStore();
  const { toggle } = useThemeStore();
  const navigate = useNavigate();
  const { data: convos = [] } = useConversations();
  const { data: models } = useModels();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (paletteOpen) {
      setQuery('');
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [paletteOpen]);

  const items: Item[] = useMemo(() => {
    const acts: Item[] = [
      { id: 'new-chat', label: 'New chat', hint: 'Goto', group: 'Actions', action: () => navigate('/chat') },
      { id: 'dashboard', label: 'Go to Dashboard', group: 'Actions', action: () => navigate('/dashboard') },
      { id: 'projects', label: 'Go to Projects', group: 'Actions', action: () => navigate('/projects') },
      { id: 'settings', label: 'Open Settings', group: 'Actions', action: () => navigate('/settings') },
      { id: 'theme', label: 'Toggle theme', group: 'Actions', action: toggle },
    ];
    const convItems: Item[] = convos.slice(0, 30).map((c) => ({
      id: `c-${c.id}`,
      label: c.title,
      hint: 'Conversation',
      group: 'Conversations',
      action: () => navigate(`/chat/${c.id}`),
    }));
    const modelItems: Item[] = (models?.curated ?? []).slice(0, 6).map((id) => ({
      id: `m-${id}`,
      label: id,
      hint: 'Copy model slug',
      group: 'Models',
      action: () => {
        navigator.clipboard.writeText(id);
      },
    }));
    return [...acts, ...convItems, ...modelItems];
  }, [convos, models, navigate, toggle]);

  const filtered = useMemo(() => {
    if (!query) return items.slice(0, 14);
    const q = query.toLowerCase();
    return items.filter((i) => i.label.toLowerCase().includes(q)).slice(0, 14);
  }, [items, query]);

  useEffect(() => setIndex(0), [query]);

  if (!paletteOpen) return null;

  const run = (item: Item) => {
    setPalette(false);
    item.action();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" role="dialog" aria-label="Command palette">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setPalette(false)} />
      <div className="card relative w-full max-w-lg animate-fade-up overflow-hidden">
        <input
          ref={inputRef}
          className="w-full border-0 border-b border-surface-200 bg-transparent px-4 py-3.5 text-sm outline-none placeholder:text-surface-400 dark:border-surface-800"
          placeholder="Search chats, models, actions…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, filtered.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
            if (e.key === 'Enter' && filtered[index]) run(filtered[index]);
            if (e.key === 'Escape') setPalette(false);
          }}
        />
        <div className="max-h-[50vh] overflow-y-auto p-1.5">
          {filtered.map((item, i) => (
            <button
              key={item.id}
              onMouseEnter={() => setIndex(i)}
              onClick={() => run(item)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                i === index ? 'bg-accent-600/10 text-accent-700 dark:text-accent-300' : 'text-surface-700 dark:text-surface-200'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                {item.hint === 'Conversation' && <span className="text-xs text-surface-400">💬</span>}
                <span className="truncate">{item.label}</span>
              </span>
              <span className="ml-3 shrink-0 text-[10px] uppercase tracking-wider text-surface-400">{item.group}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-surface-400">No results</p>
          )}
        </div>
        <div className="flex items-center gap-3 border-t border-surface-200 px-4 py-2 text-[10px] text-surface-400 dark:border-surface-800">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
