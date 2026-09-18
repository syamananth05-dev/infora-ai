import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSession } from '../hooks/useSession';

export interface CatalogItem {
  n: string;
  i?: string;
  c: string;
  d?: string;
  u: string;
  a?: string;
}

const AUTH_INFO: Record<string, { label: string; cls: string }> = {
  none: { label: '🟢 No sign-in', cls: 'text-emerald-600 dark:text-emerald-400' },
  key: { label: '🔑 Needs API key', cls: 'text-amber-600 dark:text-amber-400' },
  oauth: { label: '🔒 Sign-in with app', cls: 'text-sky-600 dark:text-sky-400' },
};

function Row({
  item,
  connected,
  partial,
  onOpen,
  open,
  token,
  setToken,
  onSave,
  busy,
}: {
  item: CatalogItem;
  connected: boolean;
  partial?: boolean;
  onOpen: () => void;
  open: boolean;
  token: string;
  setToken: (v: string) => void;
  onSave: () => void;
  busy: boolean;
}) {
  const auth = item.a ? AUTH_INFO[item.a] : undefined;
  return (
    <div className="rounded-lg border border-surface-200 p-3 dark:border-surface-800">
      <div className="flex items-center gap-3">
        <span className="text-xl">{item.i ?? '🧩'}</span>
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-medium">{item.n}</h4>
          <p className="truncate text-xs text-surface-400">{item.c}{item.d ? ` — ${item.d}` : ''}</p>
        </div>
        {auth && <span className={`hidden shrink-0 text-[11px] font-medium sm:block ${auth.cls}`}>{auth.label}</span>}
        {connected ? (
          partial ? (
            <span className="shrink-0 text-xs font-medium text-amber-600 dark:text-amber-400">⚠ Needs sign-in</span>
          ) : (
            <span className="shrink-0 text-xs font-medium text-emerald-600 dark:text-emerald-400">✓ Connected</span>
          )
        ) : (
          <button onClick={onOpen} className="btn-outline shrink-0 px-3 py-1.5 text-xs">
            {open ? 'Close' : 'Connect'}
          </button>
        )}
      </div>
      {open && !connected && (
        <div className="mt-3 space-y-2 border-t border-surface-100 pt-3 dark:border-surface-800">
          <label className="block text-xs font-medium">Server URL</label>
          <input className="input text-xs" value={item.u} readOnly />
          <label className="block text-xs font-medium">Access token / API key (optional)</label>
          <input
            className="input text-xs"
            type="password"
            placeholder="only if this server needs one"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <p className="text-[11px] text-surface-400">
            {item.a === 'none'
              ? 'This server works right away — no key needed.'
              : item.a === 'key'
                ? 'Create a (usually free) API key on the provider site and paste it here.'
                : item.a === 'oauth'
                  ? 'This provider uses sign-in; paste a token if you have one, or connect later with the MCP Server preset.'
                  : 'Community server — connect and try; disconnect anytime if it is down.'}
          </p>
          <button onClick={onSave} disabled={busy} className="btn-primary px-3 py-1.5 text-xs">
            {busy ? 'Saving…' : 'Save connection'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function CatalogModal({
  onClose,
  connectedNames,
  partialNames,
}: {
  onClose: () => void;
  connectedNames: Set<string>;
  partialNames: Set<string>;
}) {
  const { session } = useSession();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('All');
  const [featured, setFeatured] = useState<CatalogItem[]>([]);
  const [community, setCommunity] = useState<CatalogItem[]>([]);
  const [communityTotal, setCommunityTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCount, setShowCount] = useState(40);
  const [msg, setMsg] = useState('');
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const base = import.meta.env.BASE_URL || '/';
    Promise.all([
      fetch(`${base}catalog/featured.json`).then((r) => r.json()),
      fetch(`${base}catalog/registry.json`).then((r) => r.json()),
    ])
      .then(([f, r]: any[]) => {
        if (!alive) return;
        setFeatured(f.items ?? []);
        setCommunity(r.items ?? []);
        setCommunityTotal(r.count ?? (r.items ?? []).length);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setMsg('Could not load the catalog. Close and retry.');
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const cats = useMemo(() => {
    const set = new Set<string>();
    featured.forEach((x) => set.add(x.c));
    if (community.length) set.add('Community');
    return ['All', ...Array.from(set).sort()];
  }, [featured, community]);

  const q = search.trim().toLowerCase();
  const matches = (x: CatalogItem) =>
    (cat === 'All' || x.c === cat) &&
    (!q || x.n.toLowerCase().includes(q) || (x.d ?? '').toLowerCase().includes(q) || x.u.toLowerCase().includes(q));

  const fList = featured.filter(matches);
  const cList = community.filter(matches);

  const add = async (item: CatalogItem) => {
    setBusy(true);
    setMsg('');
    try {
      const config: Record<string, string> = { url: item.u };
      const t = token.trim();
      if (t) config.token = t;
      if (item.a) config.auth = item.a;
      const { error } = await supabase.from('integrations').upsert(
        { name: item.n, type: 'mcp', config, created_by: session!.user.id },
        { onConflict: 'name' }
      );
      if (error) {
        setMsg(`Could not save ${item.n}: ${error.message}`);
        return;
      }
      if (!t && item.a === 'oauth') {
        setMsg(`${item.n} URL saved — but this app needs sign-in before it can be used (one-click sign-in is coming). Meanwhile: paste a token above if you have one, or use the app's preset in the Connectors tab.`);
      } else if (!t && item.a === 'key') {
        setMsg(`${item.n} URL saved — this server needs an API key. Create a (usually free) key on the provider's site, paste it above, and reconnect.`);
      } else {
        setMsg(`${item.n} connected! Ask Infora in Agent mode to use it.`);
      }
      setOpenItem(null);
      setToken('');
      qc.invalidateQueries({ queryKey: ['integrations'] });
    } finally {
      setBusy(false);
    }
  };

  const total = featured.length + communityTotal;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="card flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl p-0 sm:rounded-2xl sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-surface-100 p-4 pb-3 dark:border-surface-800 sm:p-0 sm:pb-4">
          <div>
            <h3 className="text-lg font-semibold">Connector catalog</h3>
            <p className="text-xs text-surface-400">
              {loading ? 'Loading…' : `${total.toLocaleString()} apps and MCP servers — official + community.`}
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost px-2 py-1 text-sm">
            ✕
          </button>
        </div>

        <div className="space-y-2 border-b border-surface-100 p-4 pb-3 dark:border-surface-800 sm:p-0 sm:pb-3">
          <input
            className="input"
            placeholder="Search 1,500+ connectors — e.g. Gmail, search, Notion, github…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setShowCount(40);
            }}
          />
          <div className="flex gap-1 overflow-x-auto pb-1">
            {cats.map((c) => (
              <button
                key={c}
                onClick={() => {
                  setCat(c);
                  setShowCount(40);
                }}
                className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-xs ${
                  cat === c
                    ? 'border-accent-500 bg-accent-500/10 font-medium text-accent-600 dark:text-accent-400'
                    : 'border-surface-200 text-surface-500 hover:text-surface-700 dark:border-surface-700 dark:hover:text-surface-300'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {msg && <p className="border-b border-surface-100 p-3 text-xs dark:border-surface-800">{msg}</p>}

        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-0">
          {fList.length > 0 && (
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-surface-400">
                ✨ Verified — official servers ({fList.length})
              </h4>
              <div className="space-y-2">
                {fList.map((item) => (
                  <Row
                    key={item.u}
                    item={item}
                    connected={connectedNames.has(item.n)}
                    partial={partialNames.has(item.n)}
                    open={openItem === item.u}
                    onOpen={() => {
                      setOpenItem(openItem === item.u ? null : item.u);
                      setToken('');
                      setMsg('');
                    }}
                    token={token}
                    setToken={setToken}
                    onSave={() => add(item)}
                    busy={busy}
                  />
                ))}
              </div>
            </section>
          )}

          {cList.length > 0 && (
            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-surface-400">
                🌐 Community servers
              </h4>
              <p className="mb-2 text-[11px] text-surface-400">
                Community endpoints are published by their makers and not individually re-verified — connect and try.
              </p>
              <div className="space-y-2">
                {cList.slice(0, showCount).map((item) => (
                  <Row
                    key={item.u}
                    item={item}
                    connected={connectedNames.has(item.n)}
                    partial={partialNames.has(item.n)}
                    open={openItem === item.u}
                    onOpen={() => {
                      setOpenItem(openItem === item.u ? null : item.u);
                      setToken('');
                      setMsg('');
                    }}
                    token={token}
                    setToken={setToken}
                    onSave={() => add(item)}
                    busy={busy}
                  />
                ))}
                {cList.length > showCount && (
                  <button onClick={() => setShowCount(showCount + 60)} className="btn-outline w-full px-3 py-2 text-xs">
                    Show more ({cList.length - showCount} remaining)
                  </button>
                )}
              </div>
            </section>
          )}

          {!loading && fList.length === 0 && cList.length === 0 && (
            <p className="py-8 text-center text-sm text-surface-400">No connectors match “{search}”.</p>
          )}
          {loading && <p className="py-8 text-center text-sm text-surface-400">Loading catalog…</p>}
        </div>
      </div>
    </div>
  );
}
