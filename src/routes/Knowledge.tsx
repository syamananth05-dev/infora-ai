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

async function extractText(file: File): Promise<string> {
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
    return parts.join('\n\n');
  }
  return await file.text();
}

export default function Knowledge() {
  const { session } = useSession();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['documents'],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from('documents').select('*').order('created_at', { ascending: false });
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
    try {
      let text = '';
      let name = 'Pasted note';
      if (file) {
        text = await extractText(file);
        name = file.name;
      } else {
        text = paste;
      }
      text = (text || '').trim();
      if (text.length < 20) throw new Error('Could not extract enough text from this file. If it is a scanned PDF, paste the text instead.');
      const chunks = chunkText(text);
      const { data: doc, error: derr } = await supabase
        .from('documents')
        .insert({ user_id: session!.user.id, name, size: text.length, chunks: chunks.length })
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
    }
  };

  const deleteDoc = async (d: DocRow) => {
    if (!window.confirm(`Delete "${d.name}"? Its knowledge will be removed.`)) return;
    const { error } = await supabase.from('documents').delete().eq('id', d.id);
    if (error) {
      window.alert('Could not delete: ' + error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ['documents'] });
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold">🧠 Knowledge</h1>
      <p className="mt-1 text-sm text-surface-500">
        Upload documents — your chats and the agent automatically search them when relevant. Private to your account.
      </p>

      <div className="mt-4 rounded-xl border border-surface-200 bg-surface-50 p-4 dark:border-surface-800 dark:bg-surface-900">
        <label className="block text-sm font-medium">Upload a file (.txt, .md, .csv, .pdf)</label>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.md,.csv,.pdf"
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
      </div>

      <h2 className="mt-6 text-sm font-medium uppercase tracking-wider text-surface-400">
        Your documents ({docs.length})
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
                onClick={() => deleteDoc(d)}
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
