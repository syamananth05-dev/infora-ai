import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';

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
    if (/\.(xlsx|xls)$/i.test(f.name)) {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
      setRows((json as unknown[][]).map((r) => r.map((c) => String(c ?? ''))));
    } else {
      const text = await f.text();
      setRows(parseCsv(text));
    }
  };

  const topCategories = useMemo(() => {
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
        Upload a CSV, TSV, or Excel file, see instant stats and charts, and ask Infora questions about your data.
      </p>

      <label className="mt-4 flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-surface-300 p-6 text-sm text-surface-500 dark:border-surface-700" title="Upload CSV">
        {fileName ? `Loaded: ${fileName}` : 'Click to upload a CSV file'}
        <input
          type="file"
          accept=".csv,.tsv,.xlsx,.xls,text/csv"
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

          {topCategories.length > 0 && (
            <div className="card mt-2 p-4">
              <p className="text-xs font-medium text-surface-400">{topCatName} — top categories</p>
              <div className="mt-3 space-y-1.5">
                {topCategories.map((c) => (
                  <div key={c.name} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 truncate text-xs text-surface-500">{c.name}</span>
                    <div className="h-4 rounded bg-primary/80" style={{ width: `${Math.round((c.count / topCategories[0].count) * 100)}%`, minWidth: 4 }} />
                    <span className="text-xs tabular-nums text-surface-400">{c.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

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
