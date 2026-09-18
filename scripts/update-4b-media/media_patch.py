import os
import sys

root = sys.argv[1] if len(sys.argv) > 1 else '.'

# ============ 1. ImageGen.tsx (free, Pollinations) ============

image_tsx = r'''import { useState } from 'react';

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
'''

open(os.path.join(root, 'src', 'routes', 'ImageGen.tsx'), 'w').write(image_tsx)

# ============ 2. VideoGen.tsx (BYOK fal.ai) ============

video_tsx = r'''import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../hooks/useSession';

export default function VideoGen() {
  const { session } = useSession();
  const [key, setKey] = useState('');
  const [keySaved, setKeySaved] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [error, setError] = useState('');
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!session) return;
      const { data } = await supabase
        .from('integrations')
        .select('config')
        .eq('name', 'fal')
        .eq('created_by', session.user.id)
        .maybeSingle();
      if (data?.config?.key) {
        setKey(String(data.config.key));
        setKeySaved(true);
      }
    };
    load();
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [session]);

  const saveKey = async () => {
    if (!key.trim() || !session) return;
    const payload = { name: 'fal', type: 'custom', config: { key: key.trim() }, updated_at: new Date().toISOString() };
    const { data: existing } = await supabase
      .from('integrations')
      .select('id')
      .eq('name', 'fal')
      .eq('created_by', session.user.id)
      .maybeSingle();
    const { error: upErr } = existing
      ? await supabase.from('integrations').update(payload).eq('id', existing.id)
      : await supabase.from('integrations').insert({ ...payload, created_by: session.user.id });
    if (upErr) {
      window.alert('Could not save key: ' + upErr.message);
      return;
    }
    setKeySaved(true);
  };

  const poll = (requestId: string) => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke('video', { body: { action: 'status', request_id: requestId } });
        if (fnError) throw fnError;
        if (data?.error) throw new Error(data.error);
        if (data?.status === 'COMPLETED') {
          if (pollRef.current) window.clearInterval(pollRef.current);
          setVideoUrl(data.video_url || '');
          setStatus('');
          setBusy(false);
        } else if (data?.status === 'IN_QUEUE') {
          setStatus(`Queued${data.queue_position != null ? ` (position ${data.queue_position})` : ''}…`);
        } else {
          setStatus('Rendering your video…');
        }
      } catch (e: any) {
        if (pollRef.current) window.clearInterval(pollRef.current);
        setError(e?.message || 'Video failed');
        setStatus('');
        setBusy(false);
      }
    }, 5000);
  };

  const generate = async () => {
    if (busy || !prompt.trim()) return;
    setBusy(true);
    setError('');
    setVideoUrl('');
    setStatus('Submitting to fal.ai…');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('video', { body: { action: 'create', prompt: prompt.trim() } });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setStatus('Queued…');
      poll(data.request_id);
    } catch (e: any) {
      setError(e?.message || 'Could not start video');
      setStatus('');
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold">🎬 Video Studio</h1>
      <p className="mt-1 text-sm text-surface-500">
        Text to video. Video generation is genuinely expensive computing, so it runs on your own fal.ai credits (a few rupees per clip).
      </p>

      <div className="mt-4 rounded-xl border border-surface-200 bg-surface-50 p-4 dark:border-surface-800 dark:bg-surface-900">
        <label className="block text-sm font-medium">Your fal.ai API key</label>
        <div className="mt-1 flex gap-2">
          <input
            type="password"
            value={key}
            onChange={(e) => { setKey(e.target.value); setKeySaved(false); }}
            placeholder="Paste your fal.ai key (fal.ai → Keys)"
            className="input flex-1"
          />
          <button onClick={saveKey} disabled={!key.trim()} className="btn-primary shrink-0">
            {keySaved ? 'Saved ✓' : 'Save'}
          </button>
        </div>
        <p className="mt-1 text-xs text-surface-400">
          Get one at fal.ai (sign up → Keys). Stored privately in your account, never shared. {keySaved ? 'Key saved.' : ''}
        </p>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          placeholder="e.g. Drone shot flying over rice fields at golden hour, cinematic"
          className="input mt-3 w-full"
        />
        <button onClick={generate} disabled={busy || !prompt.trim() || !keySaved} className="btn-primary mt-3">
          {busy ? status || 'Working…' : 'Generate video'}
        </button>
      </div>

      {error ? <p className="mt-4 text-sm text-red-500">{error}</p> : null}

      {videoUrl ? (
        <div className="mt-6">
          <video src={videoUrl} controls playsInline className="w-full rounded-lg border border-surface-200 dark:border-surface-800" />
          <a
            href={videoUrl}
            download="infora-video.mp4"
            className="mt-2 inline-block text-sm text-primary hover:underline"
          >
            Download video
          </a>
        </div>
      ) : null}
    </div>
  );
}
'''

open(os.path.join(root, 'src', 'routes', 'VideoGen.tsx'), 'w').write(video_tsx)

# ============ 3. Patch App.tsx ============

ap = os.path.join(root, 'src', 'App.tsx')
a = open(ap).read()

imp_anchor = "import Studio from './routes/Studio';"
assert imp_anchor in a, 'App.tsx import anchor missing'
a = a.replace(imp_anchor, imp_anchor + "\nimport ImageGen from './routes/ImageGen';\nimport VideoGen from './routes/VideoGen';", 1)

route_anchor = '          <Route path="/studio" element={<Studio />} />'
assert route_anchor in a, 'App.tsx studio route anchor missing'
a = a.replace(route_anchor, route_anchor + '\n          <Route path="/image" element={<ImageGen />} />\n          <Route path="/video" element={<VideoGen />} />', 1)
open(ap, 'w').write(a)

# ============ 4. Patch Sidebar.tsx ============

sp = os.path.join(root, 'src', 'components', 'Sidebar.tsx')
s = open(sp).read()

nav_anchor = '        <NavLink to="/studio" label="Studio" icon="📄" />'
assert nav_anchor in s, 'Sidebar studio anchor missing'
s = s.replace(nav_anchor, nav_anchor + '\n        <NavLink to="/image" label="Image" icon="🎨" />\n        <NavLink to="/video" label="Video" icon="🎬" />', 1)
open(sp, 'w').write(s)

print('Update 4b patched: ImageGen + VideoGen + routes + nav')
