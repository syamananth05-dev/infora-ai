import sys

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

# ---------- App.tsx: analytics route ----------
patch('src/App.tsx', [
    ("import SelfBuild from './routes/SelfBuild';",
     "import SelfBuild from './routes/SelfBuild';\nimport Analytics from './routes/Analytics';"),
    ('          <Route path="/selfbuild" element={<SelfBuild />} />',
     '          <Route path="/selfbuild" element={<SelfBuild />} />\n          <Route path="/analytics" element={<Analytics />} />'),
])

# ---------- Sidebar.tsx: analytics link ----------
patch('src/components/Sidebar.tsx', [
    ('        <NavLink to="/council" label="Council" icon="⚖️" />',
     '        <NavLink to="/council" label="Council" icon="⚖️" />\n        <NavLink to="/analytics" label="Analytics" icon="📊" />'),
])

# ---------- Chat.tsx ----------
C = 'src/routes/Chat.tsx'
s = open(f'{root}/{C}').read()

# 1. useLocation import
patch(C, [
    ("import { useNavigate, useParams } from 'react-router-dom';",
     "import { useLocation, useNavigate, useParams } from 'react-router-dom';"),
])
s = open(f'{root}/{C}').read()

# 2. location + draft support (Analytics hands off to chat with a prefilled prompt)
anchor = "  const [modelSelection, setModelSelection] = useState('best');"
assert s.count(anchor) == 1, 'modelSelection state'
s = s.replace(anchor, anchor + "\n  const location = useLocation();", 1)

anchor = """  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.rpc('credit_summary');"""
assert s.count(anchor) == 1, 'founder effect anchor'
DRAFT = """  useEffect(() => {
    const draft = (location.state as any)?.draft;
    if (draft) {
      setInput(draft);
      navigate('/chat', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

"""
s = s.replace(anchor, DRAFT + anchor, 1)

# 3. MessageBubble: html extraction + preview state
anchor = """}) {
  const isUser = msg.role === 'user';
  return (
    <div className=\"mb-6 animate-fade-up\">"""
assert s.count(anchor) == 1, 'MessageBubble anchor'
NEW_BUBBLE = """}) {
  const isUser = msg.role === 'user';
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const htmlBlocks = useMemo(() => {
    const out: string[] = [];
    const re = /```html\\s*([\\s\\S]*?)```/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(msg.content || ''))) {
      const code = m[1].trim();
      if (/<html[\\s>]|<!DOCTYPE/i.test(code)) out.push(code);
    }
    return out;
  }, [msg.content]);
  return (
    <div className=\"mb-6 animate-fade-up\">"""
s = s.replace(anchor, NEW_BUBBLE, 1)

# 4. Preview button in actions row
anchor = '          <CopyButton text={msg.content} />'
assert s.count(anchor) == 1, 'CopyButton anchor'
s = s.replace(anchor, anchor + """
          {htmlBlocks.length > 0 && (
            <button onClick={() => setPreviewHtml(htmlBlocks[0])} className=\"btn-ghost px-2 py-1 text-xs\" title=\"Preview the website\">👁 Preview</button>
          )}""", 1)

# 5. Fullscreen preview overlay after the actions block
anchor = """          {onRegenerate && <button onClick={onRegenerate} className=\"btn-ghost px-2 py-1 text-xs\" title=\"Regenerate\">↻ Regenerate</button>}
        </div>
      )}"""
assert s.count(anchor) == 1, 'actions anchor'
OVERLAY = anchor + """
      {previewHtml && (
        <div className=\"fixed inset-0 z-50 flex flex-col bg-white dark:bg-surface-950\">
          <div className=\"flex items-center justify-between border-b border-surface-200 px-3 py-2 dark:border-surface-800\">
            <span className=\"text-sm font-medium\">Website preview</span>
            <button onClick={() => setPreviewHtml(null)} className=\"btn-outline px-3 py-1.5 text-sm\" title=\"Close preview\">✕ Close</button>
          </div>
          <iframe title=\"Website preview\" srcDoc={previewHtml} sandbox=\"allow-scripts allow-popups\" className=\"h-full w-full flex-1 bg-white\" />
        </div>
      )}"""
s = s.replace(anchor, OVERLAY, 1)

open(f'{root}/{C}', 'w').write(s)
print('patched Chat.tsx')

# ---------- Analytics.tsx: new page (ASCII only) ----------
ANALYTICS = r'''import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || r[0] !== '');
}

export default function Analytics() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<string[][]>([]);
  const [fileName, setFileName] = useState('');
  const [question, setQuestion] = useState('');

  const header = rows[0] ?? [];
  const body = useMemo(() => rows.slice(1), [rows]);

  const stats = useMemo(() => {
    const out: { col: string; count: number; min: number; max: number; avg: number; median: number }[] = [];
    header.forEach((h, ci) => {
      const vals = body.map((r) => parseFloat(r[ci])).filter((v) => !isNaN(v));
      const filled = body.filter((r) => r[ci] !== '').length;
      if (filled > 0 && vals.length / filled > 0.8 && vals.length > 0) {
        const sum = vals.reduce((a, b) => a + b, 0);
        const sorted = [...vals].sort((a, b) => a - b);
        out.push({ col: h, count: vals.length, min: sorted[0], max: sorted[sorted.length - 1], avg: sum / vals.length, median: sorted[Math.floor(sorted.length / 2)] });
      }
    });
    return out;
  }, [header, body]);

  const onFile = async (f: File) => {
    setFileName(f.name);
    const text = await f.text();
    setRows(parseCsv(text));
  };

  const askInfora = () => {
    if (!rows.length || !question.trim()) return;
    const sample = rows.slice(0, 26).map((r) => r.join(' | ')).join('\n');
    const numericSummary = stats.map((s) => `${s.col}: min ${s.min.toFixed(2)}, max ${s.max.toFixed(2)}, avg ${s.avg.toFixed(2)}, median ${s.median}`).join('; ');
    const prompt = `I have a data file "${fileName}" with ${body.length} rows and ${header.length} columns.\n\nColumns: ${header.join(', ')}\n\nNumeric column stats: ${numericSummary || 'none'}\n\nFirst rows:\n${sample}\n\nMy question: ${question}`;
    navigate('/chat', { state: { draft: prompt } });
  };

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <h1 className="text-2xl font-bold">📊 Analytics</h1>
      <p className="mt-1 text-sm text-surface-500">
        Upload a CSV file, see instant stats, and ask Infora questions about your data. Excel users: save as CSV first (more file types coming soon).
      </p>

      <label className="mt-4 flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-surface-300 p-6 text-sm text-surface-500 dark:border-surface-700" title="Upload CSV">
        {fileName ? `Loaded: ${fileName}` : 'Click to upload a CSV file'}
        <input
          type="file"
          accept=".csv,.tsv,text/csv"
          className="hidden"
          onChange={(e) => e.target.files && onFile(e.target.files[0])}
        />
      </label>

      {rows.length > 0 && (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {stats.map((s) => (
              <div key={s.col} className="card p-3">
                <p className="text-xs font-medium text-surface-400">{s.col}</p>
                <p className="mt-1 text-sm font-semibold tabular-nums">avg {s.avg.toFixed(2)}</p>
                <p className="text-xs text-surface-400 tabular-nums">min {s.min.toFixed(2)} · max {s.max.toFixed(2)} · n={s.count}</p>
              </div>
            ))}
          </div>

          <div className="card mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-surface-200 dark:border-surface-800">
                  {header.map((h, i) => (
                    <th key={i} className="px-2 py-1.5 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.slice(0, 10).map((r, i) => (
                  <tr key={i} className="border-b border-surface-100 dark:border-surface-900">
                    {r.map((cell, j) => (
                      <td key={j} className="px-2 py-1">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {body.length > 10 && <p className="px-2 py-1.5 text-xs text-surface-400">…and {body.length - 10} more rows</p>}
          </div>

          <div className="mt-4">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask anything about this data — trends, anomalies, forecasts…"
              className="input min-h-[70px]"
            />
            <button onClick={askInfora} disabled={!question.trim()} className="btn-primary mt-2">
              Ask Infora about this data
            </button>
          </div>
        </>
      )}
    </div>
  );
}
'''
open(f'{root}/src/routes/Analytics.tsx', 'w').write(ANALYTICS)
print('wrote Analytics.tsx')

print('Update 9 complete')
