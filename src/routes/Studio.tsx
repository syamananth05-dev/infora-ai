import { useState } from 'react';
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
