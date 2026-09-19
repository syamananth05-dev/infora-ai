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

# ---------- Council.tsx: founder-only FREE toggle ----------
patch('src/routes/Council.tsx', [
    (r"""import { useState } from 'react';""",
     r"""import { useEffect, useState } from 'react';"""),
    (r"""  const [charged, setCharged] = useState<number | null>(null);
  const [error, setError] = useState('');""",
     r"""  const [charged, setCharged] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [founder, setFounder] = useState(false);
  const [freeMode, setFreeMode] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.rpc('credit_summary');
        setFounder(!!(data as any)?.founder);
      } catch {}
    })();
  }, []);"""),
    (r"""        body: { question: question.trim(), size: seats, ...(personas.length ? { personas } : {}) },""",
     r"""        body: { question: question.trim(), size: seats, model_selection: freeMode ? 'free' : 'best', ...(personas.length ? { personas } : {}) },"""),
    (r"""          </select>
        </label>
      </div>""",
     r"""          </select>
        </label>
        {founder && (
          <button
            onClick={() => setFreeMode((v) => !v)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${freeMode ? 'border-accent-500 bg-accent-500/10 text-accent-600 dark:text-accent-400' : 'border-surface-300 text-surface-500 dark:border-surface-600 dark:text-surface-300'}`}
            title="Founder: run every expert on free AI models — zero cost, may be slower"
          >
            🆓 Free
          </button>
        )}
      </div>"""),
])

# ---------- Chat.tsx: 'free' selection now routes Agent mode to a free model too ----------
patch('src/routes/Chat.tsx', [
    (r"""            setModel(v === 'best' || v === 'free' ? '' : v);""",
     r"""            setModel(v === 'best' ? '' : v === 'free' ? 'meta-llama/llama-3.3-70b-instruct:free' : v);"""),
])

print('Update 15 complete')
