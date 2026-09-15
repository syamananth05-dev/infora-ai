import { useMemo, useRef, useState } from 'react';
import { useModels } from '../../hooks/useSession';
import { formatContext } from '../../lib/types';

export default function ModelPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (model: string) => void;
}) {
  const { data } = useModels();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const models = data?.models ?? [];
  const curated = data?.curated ?? [];

  const list = useMemo(() => {
    const q = query.toLowerCase();
    const matches = models.filter(
      (m) => !q || m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
    );
    // curated first
    const order = (id: string) => {
      const i = curated.indexOf(id);
      return i === -1 ? 999 : i;
    };
    return [...matches].sort((a, b) => order(a.id) - order(b.id)).slice(0, 60);
  }, [models, curated, query]);

  const current = models.find((m) => m.id === value);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="btn-outline max-w-[260px] gap-2 py-1.5 text-xs"
        title="Switch model"
      >
        <span className="truncate font-mono">{current?.name ?? value ?? 'Select model'}</span>
        <span className="text-surface-400">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="card absolute right-0 z-40 mt-2 w-[340px] animate-fade-up overflow-hidden">
            <div className="border-b border-surface-200 p-2 dark:border-surface-800">
              <input
                autoFocus
                className="input"
                placeholder="Search models…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="max-h-[46vh] overflow-y-auto">
              {list.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    onChange(m.id);
                    setOpen(false);
                  }}
                  className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-surface-100 dark:hover:bg-surface-800 ${
                    m.id === value ? 'bg-accent-600/10' : ''
                    }`}
                >
                  <span className="flex w-full items-center gap-2">
                     <span className="truncate text-sm font-medium">{m.name}</span>
                    {m.reasoning && (
                       <span className="rounded bg-violet-500/15 px-1.5 py-px text-[10px] font-medium text-violet-600 dark:text-violet-300">reasoning</span>
                      )}
                      {m.vision && (
                        <span className="rounded bg-emerald-500/15 px-1.5 py-px text-[10px] font-medium text-emerald-600 dark:text-emerald-300">vision</span>
                      )}
                     {m.id === value && <span className="ml-auto text-xs text-accent-500">✓</span>}
                  </span>
                  <span className="flex w-full items-center gap-2 text-[11px] text-surface-400">
                      <span className="truncate font-mono">{m.id}</span>
                      <span className="ml-auto shrink-0">
                        {m.context_length ? `${formatContext(m.context_length)} ctx` : ''}
                        {m.input_price_per_1m !== null ? `· $${m.input_price_per_1m.toFixed(2)}/M in` : ''}
                      </span>
                   </span>
                </button>
              ))}
              {list.length === 0 && (
                  <p className="px-3 py-6 text-center text-sm text-surface-400">No models match</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
