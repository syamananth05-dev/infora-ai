import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const RATIOS = [
  { id: 'square', label: 'Square 1:1', w: 1024, h: 1024 },
  { id: 'landscape', label: 'Landscape 16:9', w: 1280, h: 720 },
  { id: 'portrait', label: 'Portrait 9:16', w: 720, h: 1280 },
];

interface Gen { prompt: string; url: string }

export default function ImageGen() {
  const [prompt, setPrompt] = useState('');
  const [ratio, setRatio] = useState('square');
  const [busy, setBusy] = useState(false);
  const [gallery, setGallery] = useState<Gen[]>([]);
  const [error, setError] = useState('');
  const [founder, setFounder] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.rpc('credit_summary');
        setFounder(!!(data as any)?.founder);
      } catch {}
    })();
  }, []);

  const generate = () => {
    if (busy || !prompt.trim()) return;
    const r = RATIOS.find((x) => x.id === ratio) || RATIOS[0];
    const seed = Math.floor(Math.random() * 1e9);
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.trim())}?width=${r.w}&height=${r.h}&seed=${seed}&nologo=true`;
    setBusy(true);
    setError('');
    const img = new Image();
    img.onload = () => {
      setGallery((g) => [{ prompt: prompt.trim(), url }, ...g].slice(0, 12));
      setBusy(false);
    };
    img.onerror = () => {
      setError('Image generation failed - the free service may be busy. Try again in a moment.');
      setBusy(false);
    };
    img.src = url;
  };

  const download = async (g: Gen) => {
    try {
      const res = await fetch(g.url);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `infora-${g.prompt.slice(0, 30).replace(/[^a-z0-9]+/gi, '-')}.jpg`;
      a.click();
    } catch {
      window.open(g.url, '_blank');
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold">🎨 Image Studio</h1>
      <p className="mt-1 text-sm text-surface-500">Describe an image — get it in seconds. Free and unlimited.</p>

      <div className="mt-4 rounded-xl border border-surface-200 bg-surface-50 p-4 dark:border-surface-800 dark:bg-surface-900">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="e.g. A warm cinematic photo of a chai stall in Hyderabad at sunset, steam rising"
          className="input w-full"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select value={ratio} onChange={(e) => setRatio(e.target.value)} className="input">
            {RATIOS.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
          {founder && (
            <span className="text-xs font-medium text-accent-600 dark:text-accent-400" title="Image generation runs on a completely free service — no credits, no wallet needed">
              🆓 100% Free
            </span>
          )}
          <button onClick={generate} disabled={busy || !prompt.trim()} className="btn-primary ml-auto">
            {busy ? 'Painting…' : 'Generate image'}
          </button>
        </div>
      </div>

      {error ? <p className="mt-4 text-sm text-red-500">{error}</p> : null}

      {gallery.length > 0 ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {gallery.map((g, i) => (
            <div key={i} className="overflow-hidden rounded-lg border border-surface-200 dark:border-surface-800">
              <img src={g.url} alt={g.prompt} className="w-full" />
              <div className="flex items-center justify-between gap-2 p-2">
                <p className="min-w-0 truncate text-xs text-surface-400">{g.prompt}</p>
                <button onClick={() => download(g)} className="shrink-0 rounded px-2 py-1 text-xs text-surface-400 hover:text-primary">
                  Download
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
