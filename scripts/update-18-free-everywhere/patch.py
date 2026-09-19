import sys

root = sys.argv[1] if len(sys.argv) > 1 else '.'

def patch(path, pairs):
    p = f'{root}/{path}'
    s = open(p).read()
    for old, new in pairs:
        n = s.count(old)
        if n != 1:
            raise SystemExit(f'{path}: anchor count={n}: {old[:70]!r}')
        s = s.replace(old, new, 1)
    open(p, 'w').write(s)
    print(f'patched {path}')

# ---------- Studio.tsx: founder-only Free toggle (default ON) ----------
patch('src/routes/Studio.tsx', [
    (r"""import { useState } from 'react';""",
     r"""import { useEffect, useState } from 'react';"""),
    (r"""  const [error, setError] = useState('');""",
     r"""  const [error, setError] = useState('');
  const [founder, setFounder] = useState(false);
  const [freeMode, setFreeMode] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.rpc('credit_summary');
        setFounder(!!(data as any)?.founder);
      } catch {}
    })();
  }, []);"""),
    (r"""{ body: { kind, prompt: prompt.trim() } }""",
     r"""{ body: { kind, prompt: prompt.trim(), model_selection: freeMode ? 'free' : 'paid' } }"""),
    (r'''        <button onClick={generate} disabled={busy || !prompt.trim()} className="btn-primary mt-3">
          {busy ? 'Creating your file…' : 'Generate file'}
        </button>''',
     r'''        <div className="mt-3 flex flex-wrap items-center gap-2">
          {founder && (
            <button
              onClick={() => setFreeMode((v) => !v)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${freeMode ? 'border-accent-500 bg-accent-500/10 text-accent-600 dark:text-accent-400' : 'border-surface-300 text-surface-500 dark:border-surface-600 dark:text-surface-300'}`}
              title="Founder: generate with free AI models — zero cost"
            >
              🆓 Free
            </button>
          )}
          <button onClick={generate} disabled={busy || !prompt.trim()} className="btn-primary">
            {busy ? 'Creating your file…' : 'Generate file'}
          </button>
        </div>'''),
])

# ---------- ImageGen.tsx: founder-only 100% Free badge ----------
patch('src/routes/ImageGen.tsx', [
    (r"""import { useState } from 'react';""",
     r"""import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';"""),
    (r"""  const [error, setError] = useState('');""",
     r"""  const [error, setError] = useState('');
  const [founder, setFounder] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.rpc('credit_summary');
        setFounder(!!(data as any)?.founder);
      } catch {}
    })();
  }, []);"""),
    (r'''          <button onClick={generate} disabled={busy || !prompt.trim()} className="btn-primary ml-auto">
            {busy ? 'Painting…' : 'Generate image'}
          </button>''',
     r'''          {founder && (
            <span className="text-xs font-medium text-accent-600 dark:text-accent-400" title="Image generation runs on a completely free service — no credits, no wallet needed">
              🆓 100% Free
            </span>
          )}
          <button onClick={generate} disabled={busy || !prompt.trim()} className="btn-primary ml-auto">
            {busy ? 'Painting…' : 'Generate image'}
          </button>'''),
])

print('Update 18 complete')
