import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSession } from '../hooks/useSession';

interface DocRow {
  id: string;
  name: string;
  size: number;
  chunks: number;
  created_at: string;
}

function chunkText(text: string, size = 1200): string[] {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let cur = '';
  for (const p of paragraphs) {
    if ((cur + '\n\n' + p).length > size && cur) {
      chunks.push(cur);
      cur = p;
    } else {
      cur = cur ? cur + '\n\n' + p : p;
    }
  }
  if (cur) chunks.push(cur);
  const out: string[] = [];
  for (const c of chunks) {
    if (c.length <= 1600) {
      out.push(c);
      continue;
    }
    for (let i = 0; i < c.length; i += size) out.push(c.slice(i, i + size));
  }
  return out;
}

async function ocrCanvas(canvas: HTMLCanvasElement): Promise<string> {
  const Tesseract = await import('tesseract.js');
  const res = await Tesseract.recognize(canvas, 'eng');
  return res.data.text || '';
}

async function extractText(file: File, onProgress?: (s: string) => void): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) {
    const pdfjs = await import('pdfjs-dist');
    // @ts-ignore - vite asset import
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const buf = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: buf }).promise;
    const parts: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      parts.push((tc.items as any[]).map((it: any) => it.str).join(' '));
    }
    let text = parts.join('\n\n');
    if (text.replace(/\s/g, '').length < 30) {
      const pages = Math.min(pdf.numPages, 30);
      const ocrParts: string[] = [];
      for (let i = 1; i <= pages; i++) {
        onProgress?.(`Scanned PDF detected - reading page ${i}/${pages} with OCR...`);
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        await page.render({ canvasContext: ctx, viewport }).promise;
        ocrParts.push(await ocrCanvas(canvas));
      }
      text = ocrParts.join('\n\n');
    }
    return text;
  }
  if (file.type.startsWith('image/')) {
    onProgress?.('Reading text from image with OCR...');
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(bitmap, 0, 0);
    return await ocrCanvas(canvas);
  }
  return await file.text();
}

export default function Knowledge() {
  const { session } = useSession();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [memoryText, setMemoryText] = useState('');
  const [memoryBusy, setMemoryBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['documents'],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from('documents').select('*').eq('kind', 'doc').order('created_at', { ascending: false });
      if (error) throw error;
      return data as DocRow[];
    },
  });

  const { data: memories = [] } = useQuery({
    queryKey: ['memories'],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from('documents').select('*').eq('kind', 'memory').order('created_at', { ascending: false });
      if (error) throw error;
      return data as DocRow[];
    },
  });

  const addKnowledge = async () => {
    if (busy) return;
    if (!file && !paste.trim()) {
      window.alert('Choose a file or paste some text first.');
      return;
    }
    setBusy(true);
    setStatus('');
    try {
      let text = '';
      let name = 'Pasted note';
      if (file) {
        setStatus('Extracting text...');
        text = await extractText(file, (s) => setStatus(s));
        name = file.name;
      } else {
        text = paste;
      }
      setStatus('');
      text = (text || '').trim();
      if (text.length < 20) throw new Error('Could not read enough text from this file. If it is handwritten or very low quality, paste the text instead.');
      const chunks = chunkText(text);
      const { data: doc, error: derr } = await supabase
        .from('documents')
        .insert({ user_id: session!.user.id, name, size: text.length, chunks: chunks.length, kind: 'doc' })
        .select('id')
        .single();
      if (derr) throw derr;
      for (let i = 0; i < chunks.length; i += 100) {
        const rows = chunks.slice(i, i + 100).map((c, j) => ({
          user_id: session!.user.id,
          document_id: doc.id,
          chunk_index: i + j,
          content: c,
        }));
        const { error: cerr } = await supabase.from('knowledge_chunks').insert(rows);
        if (cerr) throw cerr;
      }
      setPaste('');
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      qc.invalidateQueries({ queryKey: ['documents'] });
    } catch (e: any) {
      window.alert('Upload failed: ' + (e?.message || 'unknown error'));
    } finally {
      setBusy(false);
      setStatus('');
    }
  };

  const addMemory = async () => {
    const text = memoryText.trim();
    if (memoryBusy || !text) return;
    setMemoryBusy(true);
    try {
      const { data: doc, error: derr } = await supabase
        .from('documents')
        .insert({ user_id: session!.user.id, name: `Memory: ${text.slice(0, 40)}${text.length > 40 ? '…' : ''}`, size: text.length, chunks: 1, kind: 'memory' })
        .select('id')
        .single();
      if (derr) throw derr;
      const { error: cerr } = await supabase.from('knowledge_chunks').insert({
        user_id: session!.user.id,
        document_id: doc.id,
        chunk_index: 0,
        content: text,
      });
      if (cerr) throw cerr;
      setMemoryText('');
      qc.invalidateQueries({ queryKey: ['memories'] });
    } catch (e: any) {
      window.alert('Could not save memory: ' + (e?.message || 'unknown error'));
    } finally {
      setMemoryBusy(false);
    }
  };

  const deleteDoc = async (d: DocRow, kind: string) => {
    if (!window.confirm(`Delete "${d.name}"?`)) return;
    const { error } = await supabase.from('documents').delete().eq('id', d.id);
    if (error) {
      window.alert('Could not delete: ' + error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: [kind] });
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold">🧠 Knowledge & Memory</h1>
      <p className="mt-1 text-sm text-surface-500">
        Your chats and the agent automatically search your documents and memories. Private to your account.
      </p>

      <div className="mt-4 rounded-xl border border-surface-200 bg-surface-50 p-4 dark:border-surface-800 dark:bg-surface-900">
        <label className="block text-sm font-medium">Upload a document (.txt, .md, .csv, .pdf, photos & scans)</label>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.md,.csv,.pdf,.png,.jpg,.jpeg,.webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-2 block w-full text-sm"
        />
        <p className="mt-2 text-xs text-surface-400">Or paste text below:</p>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={4}
          placeholder="Paste notes, reports, any text..."
          className="input mt-1 w-full"
        />
        <button onClick={addKnowledge} disabled={busy} className="btn-primary mt-3">
          {busy ? 'Processing…' : 'Add to knowledge'}
        </button>
        {status ? <p className="mt-2 text-xs text-surface-400">{status}</p> : null}
      </div>

      <div className="mt-4 rounded-xl border border-surface-200 bg-surface-50 p-4 dark:border-surface-800 dark:bg-surface-900">
        <label className="block text-sm font-medium">🧬 Memory — things Infora should always remember</label>
        <p className="mt-1 text-xs text-surface-400">Facts about you: your name, work, preferences, goals. Used automatically in every chat.</p>
        <div className="mt-2 flex gap-2">
          <input
            value={memoryText}
            onChange={(e) => setMemoryText(e.target.value)}
            placeholder="e.g. I am Syam, I prefer short answers, I sell SaaS tools"
            className="input flex-1"
          />
          <button onClick={addMemory} disabled={memoryBusy || !memoryText.trim()} className="btn-primary shrink-0">
            {memoryBusy ? '…' : 'Remember'}
          </button>
        </div>
        {memories.length > 0 ? (
          <ul className="mt-3 space-y-1">
            {memories.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-2 text-sm">
                <span className="min-w-0 break-words">{m.name.replace(/^Memory: /, '')}</span>
                <button
                  onClick={() => deleteDoc(m, 'memories')}
                  className="shrink-0 text-xs text-surface-400 hover:text-red-500"
                >
                  Forget
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <h2 className="mt-6 text-sm font-medium uppercase tracking-wider text-surface-400">
        Documents ({docs.length})
      </h2>
      {isLoading ? (
        <p className="mt-2 text-sm text-surface-400">Loading…</p>
      ) : docs.length === 0 ? (
        <p className="mt-2 text-sm text-surface-400">No documents yet. Add one above, then ask about it in chat.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {docs.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 dark:border-surface-800 dark:bg-surface-900"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{d.name}</p>
                <p className="text-xs text-surface-400">
                  {d.chunks} chunks · {(d.size / 1000).toFixed(1)}k chars · {new Date(d.created_at).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => deleteDoc(d, 'documents')}
                className="shrink-0 rounded px-2 py-1 text-xs text-surface-400 hover:bg-red-500/10 hover:text-red-500"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
