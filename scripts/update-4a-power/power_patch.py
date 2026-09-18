import os
import sys

root = sys.argv[1] if len(sys.argv) > 1 else '.'

# ============ 1. Research.tsx ============

research_tsx = r'''import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSession } from '../hooks/useSession';

interface Citation { title: string; url: string }
interface ReportRow { id: string; topic: string; content: string | null; status: string; citations: Citation[] | null; created_at: string }

export default function Research() {
  const { session } = useSession();
  const qc = useQueryClient();
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ id: string; content: string; citations: Citation[] } | null>(null);
  const [error, setError] = useState('');
  const [shareUrl, setShareUrl] = useState('');

  const { data: past = [] } = useQuery({
    queryKey: ['research_reports'],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from('research_reports').select('*').order('created_at', { ascending: false }).limit(5);
      if (error) throw error;
      return data as ReportRow[];
    },
  });

  const run = async () => {
    if (busy || !question.trim()) return;
    setBusy(true);
    setError('');
    setResult(null);
    setShareUrl('');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('research', { body: { question: question.trim() } });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setResult({ id: data.id, content: data.content, citations: data.citations || [] });
      qc.invalidateQueries({ queryKey: ['research_reports'] });
    } catch (e: any) {
      setError(e?.message || 'Research failed');
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!result) return;
    try {
      const { error: fnError } = await supabase.functions.invoke('research', { body: { action: 'share', id: result.id, share: true } });
      if (fnError) throw fnError;
      const url = `${window.location.origin}${import.meta.env.BASE_URL}r/${result.id}`;
      setShareUrl(url);
      try { await navigator.clipboard.writeText(url); } catch {}
    } catch (e: any) {
      window.alert('Could not share: ' + (e?.message || 'error'));
    }
  };

  const viewPast = (r: ReportRow) => {
    if (r.status !== 'done') return;
    setResult({ id: r.id, content: r.content || '', citations: (r.citations as any) || [] });
    setShareUrl('');
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold">🔭 Deep Research</h1>
      <p className="mt-1 text-sm text-surface-500">
        Infora plans searches, reads up to 6 pages across the web, and writes a fully-cited report. Takes 1-3 minutes.
      </p>

      <div className="mt-4 rounded-xl border border-surface-200 bg-surface-50 p-4 dark:border-surface-800 dark:bg-surface-900">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          placeholder="e.g. What are the best low-cost marketing channels for Indian SaaS startups in 2026?"
          className="input w-full"
        />
        <button onClick={run} disabled={busy || !question.trim()} className="btn-primary mt-3">
          {busy ? 'Researching deeply (1-3 min)…' : 'Start deep research'}
        </button>
      </div>

      {error ? <p className="mt-4 text-sm text-red-500">{error}</p> : null}

      {busy ? (
        <div className="mt-4 animate-pulse rounded-lg border border-surface-200 p-4 text-sm text-surface-400 dark:border-surface-800">
          Planning sub-questions… searching the web… reading pages… writing your report…
        </div>
      ) : null}

      {result ? (
        <div className="mt-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium uppercase tracking-wider text-surface-400">Report</h2>
            <button onClick={share} className="rounded px-2 py-1 text-xs text-surface-400 hover:text-primary">
              🔗 Share public link
            </button>
          </div>
          {shareUrl ? (
            <p className="mt-1 break-all rounded bg-primary/10 p-2 text-xs text-primary">{shareUrl}</p>
          ) : null}
          <div className="prose prose-sm mt-2 max-w-none whitespace-pre-wrap rounded-lg border border-surface-200 bg-surface-50 p-4 text-sm dark:border-surface-800 dark:bg-surface-900">
            {result.content}
          </div>
          {result.citations?.length ? (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-surface-400">Sources</p>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-xs">
                {result.citations.map((c, i) => (
                  <li key={i}>
                    <a href={c.url} target="_blank" rel="noreferrer" className="break-all text-primary hover:underline">{c.title || c.url}</a>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      ) : null}

      {past.length > 0 ? (
        <div className="mt-6">
          <h2 className="text-sm font-medium uppercase tracking-wider text-surface-400">Recent reports</h2>
          <ul className="mt-2 space-y-1">
            {past.map((r) => (
              <li key={r.id}>
                <button onClick={() => viewPast(r)} className="text-left text-sm text-surface-400 hover:text-primary">
                  {r.status === 'done' ? '📄' : r.status === 'running' ? '⏳' : '❌'} {r.topic} · {new Date(r.created_at).toLocaleDateString()}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
'''

open(os.path.join(root, 'src', 'routes', 'Research.tsx'), 'w').write(research_tsx)

# ============ 2. Studio.tsx ============

studio_tsx = r'''import { useState } from 'react';
import { supabase } from '../lib/supabase';

type Kind = 'docx' | 'pptx' | 'xlsx';

const KINDS: { id: Kind; label: string; hint: string }[] = [
  { id: 'docx', label: '📄 Word document', hint: 'Reports, proposals, letters, plans' },
  { id: 'pptx', label: '📊 PowerPoint', hint: 'Pitch decks, presentations' },
  { id: 'xlsx', label: '📈 Excel sheet', hint: 'Trackers, comparisons, budgets' },
];

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export default function Studio() {
  const [kind, setKind] = useState<Kind>('docx');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const generate = async () => {
    if (busy || !prompt.trim()) return;
    setBusy(true);
    setError('');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('studio', { body: { kind, prompt: prompt.trim() } });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      if (kind === 'docx') {
        const docx = await import('docx');
        const children: any[] = [new docx.Paragraph({ text: data.title || 'Document', heading: docx.HeadingLevel.HEADING_1 })];
        for (const s of data.sections || []) {
          children.push(new docx.Paragraph({ text: s.heading, heading: docx.HeadingLevel.HEADING_2 }));
          for (const p of s.paragraphs || []) children.push(new docx.Paragraph(p));
        }
        const doc = new docx.Document({ sections: [{ children }] });
        const blob = await docx.Packer.toBlob(doc);
        download(blob, `${(data.title || 'infora-doc').replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.docx`);
      } else if (kind === 'pptx') {
        const pptxgen = (await import('pptxgenjs')).default;
        const pres = new pptxgen();
        if (data.title) pres.title = data.title;
        for (const s of data.slides || []) {
          const slide = pres.addSlide();
          slide.addText(s.title || '', { x: 0.5, y: 0.3, fontSize: 26, bold: true, color: 'FF7A1A' });
          slide.addText(
            (s.bullets || []).map((b: string) => ({ text: b, options: { bullet: true } })),
            { x: 0.7, y: 1.3, fontSize: 16, color: '333333' }
          );
        }
        await pres.writeFile({ fileName: `${(data.title || 'infora-deck').replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.pptx` });
      } else {
        const ExcelJS = await import('exceljs');
        const wb = new ExcelJS.Workbook();
        for (const sh of data.sheets || []) {
          const ws = wb.addWorksheet(String(sh.name || 'Sheet').slice(0, 30));
          for (const row of sh.rows || []) ws.addRow(row);
        }
        const buf = await wb.xlsx.writeBuffer();
        download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${(data.filename || 'infora-sheet').replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.xlsx`);
      }
    } catch (e: any) {
      setError(e?.message || 'Generation failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold">📄 Document Studio</h1>
      <p className="mt-1 text-sm text-surface-500">Describe what you need — get a real Word, PowerPoint or Excel file, generated in your browser.</p>

      <div className="mt-4 rounded-xl border border-surface-200 bg-surface-50 p-4 dark:border-surface-800 dark:bg-surface-900">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {KINDS.map((k) => (
            <button
              key={k.id}
              onClick={() => setKind(k.id)}
              className={`rounded-lg border p-3 text-left text-sm ${kind === k.id ? 'border-primary bg-primary/10' : 'border-surface-200 dark:border-surface-800'}`}
            >
              <span className="font-medium">{k.label}</span>
              <span className="mt-1 block text-xs text-surface-400">{k.hint}</span>
            </button>
          ))}
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="e.g. A 8-section business proposal for a mobile car wash service in Hyderabad, targeting working professionals"
          className="input mt-3 w-full"
        />
        <button onClick={generate} disabled={busy || !prompt.trim()} className="btn-primary mt-3">
          {busy ? 'Creating your file…' : 'Generate file'}
        </button>
      </div>

      {error ? <p className="mt-4 text-sm text-red-500">{error}</p> : null}
      <p className="mt-4 text-xs text-surface-400">Files are created on your device — nothing is uploaded anywhere.</p>
    </div>
  );
}
'''

open(os.path.join(root, 'src', 'routes', 'Studio.tsx'), 'w').write(studio_tsx)

# ============ 3. PublicReport.tsx (no auth) ============

public_tsx = r'''import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

const EDGE_URL = 'https://qoqemcsmujehkrksswlg.supabase.co/functions/v1/research';

interface Citation { title: string; url: string }

export default function PublicReport() {
  const { id } = useParams();
  const [report, setReport] = useState<{ topic: string; content: string | null; citations: Citation[] | null; created_at: string } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`${EDGE_URL}?id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Report not found'))))
      .then((d) => setReport(d))
      .catch((e: any) => setError(e?.message || 'Report not found'))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <div className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded-full bg-primary" />
        <span className="text-sm font-semibold">Infora AI</span>
        <span className="text-xs text-surface-400">· Deep Research report</span>
      </div>
      {loading ? (
        <p className="mt-6 text-sm text-surface-400">Loading report…</p>
      ) : error ? (
        <p className="mt-6 text-sm text-red-500">{error}</p>
      ) : (
        <div className="mt-4">
          <h1 className="text-lg font-semibold">{report?.topic}</h1>
          <p className="mt-1 text-xs text-surface-400">{report?.created_at ? new Date(report.created_at).toLocaleString() : ''}</p>
          <div className="prose prose-sm mt-4 max-w-none whitespace-pre-wrap rounded-lg border border-surface-200 bg-surface-50 p-4 text-sm dark:border-surface-800 dark:bg-surface-900">
            {report?.content}
          </div>
          {report?.citations?.length ? (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-surface-400">Sources</p>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-xs">
                {report.citations.map((c, i) => (
                  <li key={i}>
                    <a href={c.url} target="_blank" rel="noreferrer" className="break-all text-primary hover:underline">{c.title || c.url}</a>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          <a href="../" className="mt-6 inline-block text-sm text-primary hover:underline">✦ Make your own with Infora AI — free</a>
        </div>
      )}
    </div>
  );
}
'''

open(os.path.join(root, 'src', 'routes', 'PublicReport.tsx'), 'w').write(public_tsx)

# ============ 4. Patch App.tsx ============

ap = os.path.join(root, 'src', 'App.tsx')
a = open(ap).read()

imp_anchor = "import Tasks from './routes/Tasks';"
assert imp_anchor in a, 'App.tsx import anchor missing'
a = a.replace(imp_anchor, imp_anchor + "\nimport Research from './routes/Research';\nimport Studio from './routes/Studio';\nimport PublicReport from './routes/PublicReport';", 1)

pub_anchor = '        <Route path="/" element={<Landing />} />'
assert pub_anchor in a, 'App.tsx public route anchor missing'
a = a.replace(pub_anchor, pub_anchor + '\n        <Route path="/r/:id" element={<PublicReport />} />', 1)

route_anchor = '          <Route path="/tasks" element={<Tasks />} />'
assert route_anchor in a, 'App.tsx tasks route anchor missing'
a = a.replace(route_anchor, route_anchor + '\n          <Route path="/research" element={<Research />} />\n          <Route path="/studio" element={<Studio />} />', 1)
open(ap, 'w').write(a)

# ============ 5. Patch Sidebar.tsx ============

sp = os.path.join(root, 'src', 'components', 'Sidebar.tsx')
s = open(sp).read()

nav_anchor = '        <NavLink to="/tasks" label="Tasks" icon="⏰" />'
assert nav_anchor in s, 'Sidebar tasks anchor missing'
s = s.replace(nav_anchor, nav_anchor + '\n        <NavLink to="/research" label="Research" icon="🔭" />\n        <NavLink to="/studio" label="Studio" icon="📄" />', 1)
open(sp, 'w').write(s)

print('Update 4a patched: Research + Studio + PublicReport + routes + nav')
