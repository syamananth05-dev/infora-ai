import sys, os

root = sys.argv[1] if len(sys.argv) > 1 else '.'
cp = os.path.join(root, 'src', 'components', 'CatalogModal.tsx')
c = open(cp).read()

def rep(content, old, new, count=None):
    assert old in content, 'anchor missing: ' + old[:80]
    if count is None:
        assert content.count(old) == 1, 'anchor not unique: ' + old[:80]
        return content.replace(old, new)
    return content.replace(old, new)

# E4: Row signature - add status prop
c = rep(c, "  connected,\n  partial,\n  onOpen,", "  connected,\n  partial,\n  status,\n  onOpen,")
c = rep(c, "  connected: boolean;\n  partial?: boolean;\n  onOpen: () => void;",
        "  connected: boolean;\n  partial?: boolean;\n  status?: { s: string; x: number };\n  onOpen: () => void;")

# E5: Row right side - live/offline hints next to Connect button
c = rep(c, """        ) : (
          <button onClick={onOpen} className="btn-outline shrink-0 px-3 py-1.5 text-xs">
            {open ? 'Close' : 'Connect'}
          </button>
        )}""",
        """        ) : (
          <span className="flex shrink-0 items-center gap-2">
            {status?.s === 'ok' && (
              <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">✓ Live</span>
            )}
            {status?.s === 'dead' && (
              <span className="text-[11px] font-medium text-surface-400">Offline</span>
            )}
            <button onClick={onOpen} className="btn-outline px-3 py-1.5 text-xs">
              {open ? 'Close' : 'Connect'}
            </button>
          </span>
        )}""")

# E6: open panel help text - prepend health notes
c = rep(c, """          <p className="text-[11px] text-surface-400">
            {item.a === 'none'
              ? 'This server works right away — no key needed.'""",
        """          <p className="text-[11px] text-surface-400">
            {status?.s === 'dead' && '⚠ This server was offline at the last health check — it may not respond. '}
            {status?.s === 'ok' && status.x > 0 && `✓ Live at the last check — ${status.x} tools available. `}
            {item.a === 'none'
              ? 'This server works right away — no key needed.'""")

# E1: modal state - health, testedAt, showOffline
c = rep(c, "  const [busy, setBusy] = useState(false);",
        """  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<Record<string, { s: string; x: number }>>({});
  const [testedAt, setTestedAt] = useState('');
  const [showOffline, setShowOffline] = useState(false);""")

# E2: fetch status.json alongside the catalog files
c = rep(c, """      fetch(`${base}catalog/registry.json`).then((r) => r.json()),
    ])
      .then(([f, r]: any[]) => {
        if (!alive) return;
        setFeatured(f.items ?? []);
        setCommunity(r.items ?? []);
        setCommunityTotal(r.count ?? (r.items ?? []).length);
        setLoading(false);
      })""",
        """      fetch(`${base}catalog/registry.json`).then((r) => r.json()),
      fetch(`${base}catalog/status.json`).then((r) => r.json()).catch(() => null),
    ])
      .then(([f, r, st]: any[]) => {
        if (!alive) return;
        setFeatured(f.items ?? []);
        setCommunity(r.items ?? []);
        setCommunityTotal(r.count ?? (r.items ?? []).length);
        if (st?.t) setTestedAt(String(st.t).slice(0, 10));
        const h: Record<string, { s: string; x: number }> = {};
        for (const row of st?.r ?? []) h[row.n] = { s: row.s, x: row.x ?? 0 };
        setHealth(h);
        setLoading(false);
      })""")

# E3: hide dead by default
c = rep(c, """  const fList = featured.filter(matches);
  const cList = community.filter(matches);""",
        """  const visible = (x: CatalogItem) => showOffline || health[x.n]?.s !== 'dead';
  const fList = featured.filter(matches).filter(visible);
  const cList = community.filter(matches).filter(visible);""")

# E7: pass status to Row (featured + community)
c = rep(c, "                    partial={partialNames.has(item.n)}",
        "                    partial={partialNames.has(item.n)}\n                    status={health[item.n]}", count=2)

# E8: header subtitle with tested date
c = rep(c, "              {loading ? 'Loading…' : `${total.toLocaleString()} apps and MCP servers — official + community.`}",
        """              {loading
                ? 'Loading…'
                : `${total.toLocaleString()} apps and MCP servers — official + community.${testedAt ? ` Health-checked ${testedAt}.` : ''}`}""")

# E9: show-offline toggle under the category chips
c = rep(c, """              </button>
            ))}
          </div>
        </div>

        {msg && <p className="border-b border-surface-100 p-3 text-xs dark:border-surface-800">{msg}</p>}""",
        """              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 pt-1 text-[11px] text-surface-400">
            <input
              type="checkbox"
              checked={showOffline}
              onChange={(e) => setShowOffline(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Show offline apps (hidden by default)
          </label>
        </div>

        {msg && <p className="border-b border-surface-100 p-3 text-xs dark:border-surface-800">{msg}</p>}""")

open(cp, 'w').write(c)
print('CatalogModal.tsx patched (update 2c)')
