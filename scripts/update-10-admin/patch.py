import sys, json

root = sys.argv[1] if len(sys.argv) > 1 else '.'

def patch(path, pairs):
    p = f'{root}/{path}'
    s = open(p).read()
    for old, new in pairs:
        n = s.count(old)
        if n != 1:
            raise SystemExit(f'{path}: anchor count={n}: {old[:70]!r}')
        s = s.replace(old, new, 1)
    open(p, 'w').write(s)
    print(f'patched {path}')

# ---------- package.json: add xlsx ----------
pj = json.load(open(f'{root}/package.json'))
pj.setdefault('dependencies', {})['xlsx'] = '^0.18.5'
json.dump(pj, open(f'{root}/package.json', 'w'), indent=2)
open(f'{root}/package.json', 'a').write('\n')
print('package.json: added xlsx')

# ---------- Admin.tsx: credit stats for founders ----------
A = 'src/routes/Admin.tsx'
patch(A, [
    ("""      return data as AdminModelRow[];
    },
  });""",
     """      return data as AdminModelRow[];
    },
  });

  const { data: creditStats } = useQuery({
    queryKey: ['admin-credit-stats'],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_credit_stats');
      if (error) throw error;
      return data as any;
    },
  });"""),
    ("""  if (profile && profile.role !== 'admin') {
    return <div className=\"p-10 text-center text-sm text-surface-400\">Admin access required.</div>;
  }""",
     """  if (profile && profile.role !== 'admin' && (profile as any).plan !== 'founder') {
    return <div className=\"p-10 text-center text-sm text-surface-400\">Admin access required.</div>;
  }"""),
    ("""      <p className=\"mb-8 text-sm text-surface-500\">
        Aggregated platform usage. Message content is never visible here — only totals.
      </p>""",
     """      <p className=\"mb-8 text-sm text-surface-500\">
        Aggregated platform usage. Message content is never visible here — only totals.
      </p>

      {creditStats && !creditStats.error && (
        <div className=\"mb-8 grid grid-cols-2 gap-2 sm:grid-cols-4\">
          <div className=\"card p-3\"><p className=\"text-xs text-surface-400\">Users</p><p className=\"text-lg font-bold tabular-nums\">{creditStats.total_users}</p></div>
          <div className=\"card p-3\"><p className=\"text-xs text-surface-400\">Founders</p><p className=\"text-lg font-bold tabular-nums\">{creditStats.founders}</p></div>
          <div className=\"card p-3\"><p className=\"text-xs text-surface-400\">Pro / Power</p><p className=\"text-lg font-bold tabular-nums\">{creditStats.pro} / {creditStats.power}</p></div>
          <div className=\"card p-3\"><p className=\"text-xs text-surface-400\">Active today</p><p className=\"text-lg font-bold tabular-nums\">{creditStats.active_today}</p></div>
          <div className=\"card p-3\"><p className=\"text-xs text-surface-400\">Credits granted today</p><p className=\"text-lg font-bold tabular-nums\">{creditStats.granted_today}</p></div>
          <div className=\"card p-3\"><p className=\"text-xs text-surface-400\">Credits spent today</p><p className=\"text-lg font-bold tabular-nums\">{creditStats.spent_today}</p></div>
          <div className=\"card p-3\"><p className=\"text-xs text-surface-400\">Granted this month</p><p className=\"text-lg font-bold tabular-nums\">{creditStats.granted_month}</p></div>
          <div className=\"card p-3\"><p className=\"text-xs text-surface-400\">Joining bonus left (all)</p><p className=\"text-lg font-bold tabular-nums\">{creditStats.joining_remaining_total}</p></div>
        </div>
      )}"""),
])

# ---------- Sidebar.tsx: founder admin link ----------
patch('src/components/Sidebar.tsx', [
    ('        {isFounder && <NavLink to="/selfbuild" label="Self Build" icon="🛠️" />}',
     '        {isFounder && <NavLink to="/selfbuild" label="Self Build" icon="🛠️" />}\n        {isFounder && <NavLink to="/admin" label="Admin" icon="📈" />}'),
])

# ---------- Analytics.tsx: Excel support + frequency chart ----------
patch('src/routes/Analytics.tsx', [
    ("import { useNavigate } from 'react-router-dom';",
     "import { useNavigate } from 'react-router-dom';\nimport * as XLSX from 'xlsx';"),
    ("""  const onFile = async (f: File) => {
    setFileName(f.name);
    const text = await f.text();
    setRows(parseCsv(text));
  };""",
     """  const onFile = async (f: File) => {
    setFileName(f.name);
    if (/\\.(xlsx|xls)$/i.test(f.name)) {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
      setRows((json as unknown[][]).map((r) => r.map((c) => String(c ?? ''))));
    } else {
      const text = await f.text();
      setRows(parseCsv(text));
    }
  };"""),
    ('          accept=".csv,.tsv,text/csv"',
     '          accept=".csv,.tsv,.xlsx,.xls,text/csv"'),
    ("        Upload a CSV file, see instant stats, and ask Infora questions about your data. Excel users: save as CSV first (more file types coming soon).",
     "        Upload a CSV, TSV, or Excel file, see instant stats and charts, and ask Infora questions about your data."),
    ("""  const askInfora = () => {""",
     """  const topCategories = useMemo(() => {
    const numericSet = new Set(stats.map((s) => s.col));
    const ci = header.findIndex((h) => !numericSet.has(h));
    if (ci < 0) return [] as { name: string; count: number }[];
    const counts = new Map<string, number>();
    for (const r of body) {
      const v = (r[ci] || '').trim();
      if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [header, body, stats]);
  const topCatName = topCategories.length > 0 ? header[header.findIndex((h) => !new Set(stats.map((s) => s.col)).has(h))] : '';

  const askInfora = () => {"""),
    ("""          <div className=\"card mt-4 overflow-x-auto\">""",
     """          {topCategories.length > 0 && (
            <div className=\"card mt-2 p-4\">
              <p className=\"text-xs font-medium text-surface-400\">{topCatName} — top categories</p>
              <div className=\"mt-3 space-y-1.5\">
                {topCategories.map((c) => (
                  <div key={c.name} className=\"flex items-center gap-2\">
                    <span className=\"w-28 shrink-0 truncate text-xs text-surface-500\">{c.name}</span>
                    <div className=\"h-4 rounded bg-primary/80\" style={{ width: `${Math.round((c.count / topCategories[0].count) * 100)}%`, minWidth: 4 }} />
                    <span className=\"text-xs tabular-nums text-surface-400\">{c.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className=\"card mt-4 overflow-x-auto\">"""),
])

print('Update 10 complete')
