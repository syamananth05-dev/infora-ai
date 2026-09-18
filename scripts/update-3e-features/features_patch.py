import os
import sys

root = sys.argv[1] if len(sys.argv) > 1 else '.'

# ============ 1. Knowledge.tsx v3 (documents + memories) ============

knowledge_tsx = r'''import { useRef, useState } from 'react';
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
'''

open(os.path.join(root, 'src', 'routes', 'Knowledge.tsx'), 'w').write(knowledge_tsx)

# ============ 2. Council.tsx ============

council_tsx = r'''import { useState } from 'react';
import { supabase } from '../lib/supabase';

const MODELS = [
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini (OpenAI)' },
  { id: 'deepseek/deepseek-chat', label: 'DeepSeek Chat' },
  { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' },
  { id: 'google/gemini-flash-1.5', label: 'Gemini Flash 1.5' },
  { id: 'qwen/qwen-2.5-72b-instruct', label: 'Qwen 2.5 72B' },
  { id: 'mistralai/mistral-small', label: 'Mistral Small' },
];

interface Answer {
  model: string;
  content: string;
  ok: boolean;
}

export default function Council() {
  const [question, setQuestion] = useState('');
  const [selected, setSelected] = useState<string[]>([MODELS[0].id, MODELS[1].id]);
  const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [synthesis, setSynthesis] = useState('');
  const [error, setError] = useState('');

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : prev.length >= 3 ? prev : [...prev, id]
    );
  };

  const run = async () => {
    if (busy || !question.trim() || selected.length === 0) return;
    setBusy(true);
    setError('');
    setAnswers([]);
    setSynthesis('');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('council', {
        body: { question: question.trim(), models: selected },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setAnswers(Array.isArray(data?.answers) ? data.answers : []);
      setSynthesis(data?.synthesis || '');
    } catch (e: any) {
      setError(e?.message || 'Council failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold">⚖️ Model Council</h1>
      <p className="mt-1 text-sm text-surface-500">
        Ask up to 3 AI models the same question, then get a merged best answer. Agreement = confidence.
      </p>

      <div className="mt-4 rounded-xl border border-surface-200 bg-surface-50 p-4 dark:border-surface-800 dark:bg-surface-900">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          placeholder="Your question for the council..."
          className="input w-full"
        />
        <p className="mt-3 text-xs text-surface-400">Pick 2-3 models:</p>
        <div className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
          {MODELS.map((m) => (
            <label key={m.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(m.id)}
                onChange={() => toggle(m.id)}
              />
              {m.label}
            </label>
          ))}
        </div>
        <button onClick={run} disabled={busy || !question.trim() || selected.length === 0} className="btn-primary mt-3">
          {busy ? 'Council in session…' : `Convene council (${selected.length})`}
        </button>
      </div>

      {error ? <p className="mt-4 text-sm text-red-500">{error}</p> : null}

      {answers.length > 0 ? (
        <div className="mt-6 space-y-3">
          {answers.map((a) => (
            <div key={a.model} className="rounded-lg border border-surface-200 bg-surface-50 p-3 dark:border-surface-800 dark:bg-surface-900">
              <p className="text-xs font-semibold uppercase tracking-wider text-surface-400">{a.model}</p>
              <div className="prose prose-sm mt-2 max-w-none whitespace-pre-wrap text-sm">{a.content}</div>
            </div>
          ))}
        </div>
      ) : null}

      {synthesis ? (
        <div className="mt-4 rounded-lg border-2 border-primary/50 bg-surface-50 p-3 dark:border-primary/60 dark:bg-surface-900">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">⚖️ Council verdict (merged)</p>
          <div className="prose prose-sm mt-2 max-w-none whitespace-pre-wrap text-sm">{synthesis}</div>
        </div>
      ) : null}
    </div>
  );
}
'''

open(os.path.join(root, 'src', 'routes', 'Council.tsx'), 'w').write(council_tsx)

# ============ 3. Tasks.tsx ============

tasks_tsx = r'''import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSession } from '../hooks/useSession';

interface TaskRow {
  id: string;
  name: string;
  prompt: string;
  schedule_kind: string;
  schedule_hour: number;
  every_minutes: number;
  active: boolean;
  last_run: string | null;
  next_run: string;
}

interface RunRow {
  id: string;
  task_id: string;
  status: string;
  result: string | null;
  created_at: string;
}

function nextDailyIst(hour: number): string {
  const now = new Date();
  const target = new Date(now);
  target.setUTCHours(((hour - 6) + 24) % 24, 30, 0, 0);
  if (target.getTime() <= now.getTime()) target.setUTCDate(target.getUTCDate() + 1);
  return target.toISOString();
}

export default function Tasks() {
  const { session } = useSession();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [kind, setKind] = useState('daily');
  const [hour, setHour] = useState(9);
  const [everyHours, setEveryHours] = useState(6);
  const [busy, setBusy] = useState(false);
  const [openTask, setOpenTask] = useState<string | null>(null);

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['scheduled_tasks'],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from('scheduled_tasks').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as TaskRow[];
    },
  });

  const { data: runs = [] } = useQuery({
    queryKey: ['task_runs', openTask],
    enabled: !!openTask,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_runs')
        .select('*')
        .eq('task_id', openTask)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as RunRow[];
    },
  });

  const createTask = async () => {
    if (busy || !name.trim() || !prompt.trim()) return;
    setBusy(true);
    try {
      const next_run = kind === 'daily' ? nextDailyIst(hour) : new Date(Date.now() + everyHours * 3600000).toISOString();
      const { error } = await supabase.from('scheduled_tasks').insert({
        user_id: session!.user.id,
        name: name.trim(),
        prompt: prompt.trim(),
        schedule_kind: kind,
        schedule_hour: hour,
        every_minutes: everyHours * 60,
        next_run,
      });
      if (error) throw error;
      setName('');
      setPrompt('');
      qc.invalidateQueries({ queryKey: ['scheduled_tasks'] });
    } catch (e: any) {
      window.alert('Could not create task: ' + (e?.message || 'unknown error'));
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (t: TaskRow) => {
    const { error } = await supabase.from('scheduled_tasks').update({ active: !t.active }).eq('id', t.id);
    if (error) {
      window.alert('Could not update: ' + error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ['scheduled_tasks'] });
  };

  const deleteTask = async (t: TaskRow) => {
    if (!window.confirm(`Delete task "${t.name}" and its history?`)) return;
    const { error } = await supabase.from('scheduled_tasks').delete().eq('id', t.id);
    if (error) {
      window.alert('Could not delete: ' + error.message);
      return;
    }
    if (openTask === t.id) setOpenTask(null);
    qc.invalidateQueries({ queryKey: ['scheduled_tasks'] });
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold">⏰ Scheduled Tasks</h1>
      <p className="mt-1 text-sm text-surface-500">
        Infora runs these automatically in the background (with web search) and saves the results here.
      </p>

      <div className="mt-4 rounded-xl border border-surface-200 bg-surface-50 p-4 dark:border-surface-800 dark:bg-surface-900">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Task name, e.g. Morning AI news"
          className="input w-full"
        />
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="What should Infora do? e.g. Summarize the top 5 AI news stories of the last 24h with links"
          className="input mt-2 w-full"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="input">
            <option value="daily">Every day at</option>
            <option value="interval">Every N hours</option>
          </select>
          {kind === 'daily' ? (
            <select value={hour} onChange={(e) => setHour(Number(e.target.value))} className="input">
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00 IST
                </option>
              ))}
            </select>
          ) : (
            <select value={everyHours} onChange={(e) => setEveryHours(Number(e.target.value))} className="input">
              {[1, 2, 3, 6, 12].map((h) => (
                <option key={h} value={h}>
                  every {h}h
                </option>
              ))}
            </select>
          )}
          <button onClick={createTask} disabled={busy || !name.trim() || !prompt.trim()} className="btn-primary ml-auto">
            {busy ? 'Creating…' : 'Create task'}
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="mt-4 text-sm text-surface-400">Loading…</p>
      ) : tasks.length === 0 ? (
        <p className="mt-4 text-sm text-surface-400">
          No tasks yet. Example: "Morning AI news" daily at 09:00 IST — "Summarize the top 5 AI news stories with links."
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {tasks.map((t) => (
            <li
              key={t.id}
              className="rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 dark:border-surface-800 dark:bg-surface-900"
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => setOpenTask(openTask === t.id ? null : t.id)}
                  className="min-w-0 text-left"
                >
                  <p className="truncate text-sm font-medium">
                    {t.active ? '' : '⏸ '}
                    {t.name}
                  </p>
                  <p className="text-xs text-surface-400">
                    {t.schedule_kind === 'daily'
                      ? `daily ${String(t.schedule_hour).padStart(2, '0')}:00 IST`
                      : `every ${t.every_minutes / 60}h`}
                    {' · next: ' + new Date(t.next_run).toLocaleString()}
                  </p>
                </button>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => toggleActive(t)} className="rounded px-2 py-1 text-xs text-surface-400 hover:text-primary">
                    {t.active ? 'Pause' : 'Resume'}
                  </button>
                  <button onClick={() => deleteTask(t)} className="rounded px-2 py-1 text-xs text-surface-400 hover:bg-red-500/10 hover:text-red-500">
                    Delete
                  </button>
                </div>
              </div>
              {openTask === t.id ? (
                <div className="mt-2 border-t border-surface-200 pt-2 dark:border-surface-800">
                  <p className="text-xs text-surface-400">Prompt: {t.prompt}</p>
                  {runs.length === 0 ? (
                    <p className="mt-2 text-xs text-surface-400">No runs yet — results appear here automatically.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {runs.map((r) => (
                        <details key={r.id} className="rounded border border-surface-200 p-2 dark:border-surface-800">
                          <summary className="cursor-pointer text-xs text-surface-400">
                            {r.status === 'ok' ? '✅' : '❌'} {new Date(r.created_at).toLocaleString()}
                          </summary>
                          <div className="prose prose-sm mt-2 max-w-none whitespace-pre-wrap text-sm">{r.result}</div>
                        </details>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
'''

open(os.path.join(root, 'src', 'routes', 'Tasks.tsx'), 'w').write(tasks_tsx)

# ============ 4. Patch App.tsx ============

ap = os.path.join(root, 'src', 'App.tsx')
a = open(ap).read()

imp_anchor = "import Knowledge from './routes/Knowledge';"
assert imp_anchor in a, 'App.tsx import anchor missing'
a = a.replace(imp_anchor, imp_anchor + "\nimport Council from './routes/Council';\nimport Tasks from './routes/Tasks';", 1)

route_anchor = '          <Route path="/knowledge" element={<Knowledge />} />'
assert route_anchor in a, 'App.tsx route anchor missing'
a = a.replace(route_anchor, route_anchor + '\n          <Route path="/council" element={<Council />} />\n          <Route path="/tasks" element={<Tasks />} />', 1)
open(ap, 'w').write(a)

# ============ 5. Patch Sidebar.tsx ============

sp = os.path.join(root, 'src', 'components', 'Sidebar.tsx')
s = open(sp).read()

nav_anchor = '        <NavLink to="/knowledge" label="Knowledge" icon="🧠" />'
assert nav_anchor in s, 'Sidebar nav anchor missing'
s = s.replace(nav_anchor, nav_anchor + '\n        <NavLink to="/council" label="Council" icon="⚖️" />\n        <NavLink to="/tasks" label="Tasks" icon="⏰" />', 1)
open(sp, 'w').write(s)

print('Features patched: Knowledge v3 (memories) + Council + Tasks + routes + nav')
