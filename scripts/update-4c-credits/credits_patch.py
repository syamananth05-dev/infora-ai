import os
import sys

root = sys.argv[1] if len(sys.argv) > 1 else '.'

# ============ VideoGen.tsx v2 (credits, no BYOK) ============

video_tsx = r'''import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../hooks/useSession';

export default function VideoGen() {
  const { session } = useSession();
  const [balance, setBalance] = useState<number | null>(null);
  const [videoCost, setVideoCost] = useState(10);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [error, setError] = useState('');
  const pollRef = useRef<number | null>(null);

  const refreshBalance = async () => {
    try {
      const { data, error: fnError } = await supabase.functions.invoke('video', { body: { action: 'balance' } });
      if (!fnError && data?.balance !== undefined) {
        setBalance(data.balance);
        if (data.video_cost) setVideoCost(data.video_cost);
      }
    } catch {}
  };

  useEffect(() => {
    if (session) refreshBalance();
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [session]);

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
          if (typeof data.balance === 'number') setBalance(data.balance);
          setStatus('');
          setBusy(false);
        } else if (data?.status === 'IN_QUEUE') {
          setStatus(`Queued${data.queue_position != null ? ` (position ${data.queue_position})` : ''}…`);
        } else {
          setStatus('Rendering your video…');
        }
      } catch (e: any) {
        if (pollRef.current) window.clearInterval(pollRef.current);
        setError(e?.message || 'Video failed - you have not been charged.');
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
    setStatus('Submitting…');
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
      refreshBalance();
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">🎬 Video Studio</h1>
        {balance !== null ? (
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            ⚡ {balance} credits
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-surface-500">
        Text to video, paid with credits. A video costs {videoCost} credits — charged only when it succeeds, never for failures.
      </p>

      <div className="mt-4 rounded-xl border border-surface-200 bg-surface-50 p-4 dark:border-surface-800 dark:bg-surface-900">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          placeholder="e.g. Drone shot flying over rice fields at golden hour, cinematic"
          className="input w-full"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button onClick={generate} disabled={busy || !prompt.trim()} className="btn-primary">
            {busy ? status || 'Working…' : `Generate video (${videoCost} credits)`}
          </button>
          {balance !== null && balance < videoCost ? (
            <span className="text-xs text-red-500">Not enough credits</span>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-surface-400">
          New accounts get 100 free credits. Top-ups are coming with subscriptions.
        </p>
      </div>

      {error ? <p className="mt-4 text-sm text-red-500">{error}</p> : null}

      {videoUrl ? (
        <div className="mt-6">
          <video src={videoUrl} controls playsInline className="w-full rounded-lg border border-surface-200 dark:border-surface-800" />
          <a href={videoUrl} download="infora-video.mp4" className="mt-2 inline-block text-sm text-primary hover:underline">
            Download video
          </a>
        </div>
      ) : null}
    </div>
  );
}
'''

open(os.path.join(root, 'src', 'routes', 'VideoGen.tsx'), 'w').write(video_tsx)

print('Update 4c patched: VideoGen v2 (credits)')
