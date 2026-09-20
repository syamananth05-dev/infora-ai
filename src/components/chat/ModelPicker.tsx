import { useMemo, useRef, useState } from 'react';
import { useModels } from '../../hooks/useSession';

interface ModelRow {
  id: string;
  name: string;
  reasoning?: boolean;
  vision?: boolean;
  input_price_per_1m?: number | null;
}

const PREMIUM = [
  { id: 'deepseek/deepseek-v4-flash-0731', label: 'DeepSeek V4 Flash', note: 'Deepest thinking — code, analysis, reports' },
  { id: 'openai/gpt-5.6-luna', label: 'GPT-5.6 Luna', note: 'Balanced flagship' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini', note: 'Fast everyday workhorse' },
];

const FAST = [
  { id: 'google/gemma-3-27b-it', label: 'Gemma 3 27B', note: 'Fast & light' },
  { id: 'mistralai/mistral-nemo', label: 'Mistral Nemo', note: 'Fast & light' },
];

// Update 21: live-verified free models (the old free slugs were retired by OpenRouter)
const FREE_VERIFIED = [
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', label: 'Nemotron 3 Super', note: 'Smart free all-rounder' },
  { id: 'nex-agi/nex-n2.5-pro:free', label: 'NEX N2.5 Pro', note: 'Strong free reasoning' },
  { id: 'inclusionai/ling-3.0-flash-vl:free', label: 'Ling 3.0 Flash VL', note: 'Free, image-capable' },
  { id: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31B', note: 'Free everyday model' },
];

// Update 21: the founder search only offers verified models. Dead or app-gated OpenRouter
// slugs (e.g. thinkingmachines/inkling-small:free) must never be selectable again.
const VERIFIED_IDS = [...PREMIUM, ...FAST, ...FREE_VERIFIED];

function priceLabel(p?: number | null) {
  return typeof p === 'number' ? `$${p < 1 ? p.toFixed(3) : p.toFixed(2)}/M` : '';
}

function PickerRow({
  active,
  onClick,
  label,
  note,
  right,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  note?: string;
  right?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-100 dark:hover:bg-surface-800 ${
        active ? 'bg-accent-500/10' : ''
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{label}</span>
        {note && <span className="block truncate text-[11px] text-surface-400">{note}</span>}
      </span>
      {right && <span className="shrink-0 text-[10px] text-surface-400">{right}</span>}
      {active && <span className="shrink-0 text-xs text-accent-500">✓</span>}
    </button>
  );
}

export default function ModelPicker({
  value,
  onChange,
  founder,
}: {
  value: string;
  onChange: (v: string) => void;
  founder?: boolean;
}) {
  const { data } = useModels();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const models: ModelRow[] = data?.models ?? [];

  const label =
    value === 'best'
      ? '⚡ The Best'
      : value === 'free'
        ? '🆓 Free'
        : models.find((m) => m.id === value)?.name ?? (value ? value.split('/').pop()! : 'The Best');

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !founder) return [];
    return VERIFIED_IDS.filter((m) => m.label.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
      .map((m) => ({ id: m.id, name: m.label, input_price_per_1m: models.find((x) => x.id === m.id)?.input_price_per_1m }));
  }, [models, query, founder]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex max-w-[150px] items-center gap-1.5 rounded-full border border-surface-300 px-3 py-1.5 text-xs font-medium hover:border-accent-500 dark:border-surface-600"
        title="Choose model"
      >
        <span className="truncate">{label}</span>
        <span className="text-surface-400">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => { setOpen(false); setQuery(''); }} />
          <div className="card absolute right-0 z-40 mt-2 w-[min(92vw,360px)] animate-fade-up overflow-hidden">
            <div className="max-h-[56vh] overflow-y-auto">
              <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-surface-400">Recommended</p>
              <PickerRow active={value === 'best'} onClick={() => pick('best')} label="⚡ The Best" note="Auto-picks the smartest model for each message" />
              {founder && (
                <PickerRow active={value === 'free'} onClick={() => pick('free')} label="🆓 Free" note="Fastest — never costs a credit" />
              )}
              {!founder && (
                <p className="px-3 py-2 text-[11px] text-surface-400">
                  Pro & Power plans unlock direct model choice. Everything else stays the same.
                </p>
              )}
              {founder && (
                <>
                  <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-surface-400">Premium</p>
                  {PREMIUM.map((m) => (
                    <PickerRow
                      key={m.id}
                      active={value === m.id}
                      onClick={() => pick(m.id)}
                      label={m.label}
                      note={m.note}
                      right={priceLabel(models.find((x) => x.id === m.id)?.input_price_per_1m)}
                    />
                  ))}
                  <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-surface-400">Free (verified)</p>
                  {FREE_VERIFIED.map((m) => (
                    <PickerRow key={m.id} active={value === m.id} onClick={() => pick(m.id)} label={m.label} note={m.note} />
                  ))}
                  <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-surface-400">Fast & light</p>
                  {FAST.map((m) => (
                    <PickerRow key={m.id} active={value === m.id} onClick={() => pick(m.id)} label={m.label} note={m.note} />
                  ))}
                </>
              )}
            </div>
            {founder && (
              <div className="border-t border-surface-200 p-2 dark:border-surface-800">
                <input
                  className="input"
                  placeholder="Search all models…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <div className="mt-1 max-h-[36vh] overflow-y-auto">
                    {searchResults.map((m) => (
                      <PickerRow
                        key={m.id}
                        active={m.id === value}
                        onClick={() => pick(m.id)}
                        label={m.name}
                        note={m.id}
                        right={priceLabel(m.input_price_per_1m)}
                      />
                    ))}
                    {searchResults.length === 0 && (
                      <p className="px-3 py-4 text-center text-xs text-surface-400">No models match</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
