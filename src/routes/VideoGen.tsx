import { useEffect, useRef, useState } from 'react';
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
