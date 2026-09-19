import sys, os

root = sys.argv[1] if len(sys.argv) > 1 else '.'

def patch(path, pairs, allow_missing=False):
    p = f'{root}/{path}'
    s = open(p).read()
    for old, new in pairs:
        n = s.count(old)
        if n != 1:
            if allow_missing and n == 0:
                continue
            raise SystemExit(f'{path}: anchor count={n}: {old[:70]!r}')
        s = s.replace(old, new, 1)
    open(p, 'w').write(s)
    print(f'patched {path}')

# ---- App.tsx: remove video route + import ----
patch('src/App.tsx', [
    ("import VideoGen from './routes/VideoGen';\n", ''),
    ('          <Route path="/video" element={<VideoGen />} />\n', ''),
])

# ---- Sidebar.tsx: founder check via credit_summary RPC; remove video link ----
patch('src/components/Sidebar.tsx', [
    ("    supabase.functions\n      .invoke('video', { body: { action: 'balance' } })\n      .then(({ data }) => { if (data && data.founder) setIsFounder(true); })\n      .catch(() => {});",
     "    (async () => {\n      try {\n        const { data } = await supabase.rpc('credit_summary');\n        if (data && (data as any).founder) setIsFounder(true);\n      } catch {}\n    })();"),
    ('        <NavLink to="/video" label="Video" icon="🎬" />\n', ''),
])

# ---- Chat.tsx: remove level selector + level payload ----
patch('src/routes/Chat.tsx', [
    ("  const [level, setLevel] = useState<1 | 2 | 3>(1);\n", ''),
    ("        ...(agentMode || opts?.model ? { model: useModel } : {}),\n        level,",
     "        model: useModel,"),
])

SELECT_BLOCK = (
    '            <select\n'
    '              value={level}\n'
    '              onChange={(e) => setLevel(Number(e.target.value) as 1 | 2 | 3)}\n'
    '              className="input w-auto shrink-0 py-1.5 text-sm"\n'
    '              title="Infora Level \u2014 L1 free, L2 smarter (1 credit), L3 smartest (10 credits)"\n'
    '            >\n'
    '              <option value={1}>L1 \u00b7 Free</option>\n'
    '              <option value={2}>L2 \u00b7 Smart</option>\n'
    '              <option value={3}>L3 \u00b7 Genius</option>\n'
    '            </select>\n'
)
patch('src/routes/Chat.tsx', [(SELECT_BLOCK, '')])

# ---- CreditsChip.tsx: full rewrite to wallet-based credits ----
CHIP = '''import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../hooks/useSession';

export default function CreditsChip() {
  const { session } = useSession();
  const [available, setAvailable] = useState<number | null>(null);
  const [founder, setFounder] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('credit_summary');
      if (!error && data) {
        setFounder(!!(data as any).founder);
        if (!(data as any).founder && typeof (data as any).available === 'number') {
          setAvailable((data as any).available);
        }
      }
    } catch {}
    setLoading(false);
  }, [session]);

  useEffect(() => {
    refresh();
    const iv = window.setInterval(refresh, 60000);
    return () => window.clearInterval(iv);
  }, [refresh]);

  if (!session) return null;

  return (
    <button
      onClick={refresh}
      title="Your credits. Daily credits refresh at midnight; your joining bonus never expires. Tap to refresh."
      className="mx-2 mb-2 mt-1 flex w-[calc(100%-1rem)] items-center justify-between rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-left"
    >
      <span className="text-xs font-medium text-primary">\u26a1 Credits</span>
      <span className="text-sm font-bold text-primary">
        {founder ? '\u221e' : loading && available === null ? '\u2026' : available === null ? '\u2014' : available}
      </span>
    </button>
  );
}
'''
open(f'{root}/src/components/CreditsChip.tsx', 'w').write(CHIP)
print('rewrote CreditsChip.tsx')

# ---- delete VideoGen.tsx ----
vg = f'{root}/src/routes/VideoGen.tsx'
if os.path.exists(vg):
    os.remove(vg)
    print('deleted VideoGen.tsx')

print('Update 7 complete')
