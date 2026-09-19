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

# ---------- Council.tsx: render Markdown in expert answers + summary ----------
patch('src/routes/Council.tsx', [
    (r"""import { supabase } from '../lib/supabase';""",
     r"""import { supabase } from '../lib/supabase';
import { Markdown } from '../components/Markdown';"""),
    (r'''              <div className="mt-2 whitespace-pre-wrap text-sm">{a.content}</div>''',
     r'''              <div className="mt-2 text-sm"><Markdown content={a.content} /></div>'''),
    (r'''          <div className="mt-2 whitespace-pre-wrap text-sm">{summary}</div>''',
     r'''          <div className="mt-2 text-sm"><Markdown content={summary} /></div>'''),
])

# ---------- Research.tsx: render Markdown in the report body ----------
patch('src/routes/Research.tsx', [
    (r"""import { supabase } from '../lib/supabase';""",
     r"""import { supabase } from '../lib/supabase';
import { Markdown } from '../components/Markdown';"""),
    (r'''            {result.content}
          </div>''',
     r'''            <Markdown content={result.content} />
          </div>'''),
])

# ---------- SharedView.tsx: render Markdown in shared messages ----------
patch('src/routes/SharedView.tsx', [
    (r"""import { supabase } from '../lib/supabase';""",
     r"""import { supabase } from '../lib/supabase';
import { Markdown } from '../components/Markdown';"""),
    (r'''              <div className="mt-2 whitespace-pre-wrap text-sm">{m.content}</div>''',
     r'''              <div className="mt-2 text-sm"><Markdown content={m.content} /></div>'''),
])

print('Update 17 complete')
