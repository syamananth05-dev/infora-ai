import sys, base64, pathlib

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

# ---------- api.ts ----------
patch('src/lib/api.ts', [
    ("  level?: 1 | 2 | 3;",
     "  level?: 1 | 2 | 3;\n  model_selection?: string;"),
])

# ---------- Chat.tsx ----------
C = 'src/routes/Chat.tsx'
s = open(f'{root}/{C}').read()

if "from '../lib/supabase'" not in s:
    anchor = "import { useModels, useSession } from '../hooks/useSession';"
    assert s.count(anchor) == 1, 'useModels import'
    s = s.replace(anchor, anchor + "\nimport { supabase } from '../lib/supabase';", 1)

# ensure useEffect imported from react
import re
m = re.search(r"import \{([^}]*)\} from 'react';", s)
assert m, 'react import not found'
if 'useEffect' not in m.group(1):
    s = s.replace(m.group(0), m.group(0).replace('import {', 'import { useEffect,' if not m.group(1).strip().startswith('useEffect') else 'import {'), 1)
    if 'useEffect' not in re.search(r"import \{([^}]*)\} from 'react';", s).group(1):
        s = s.replace("} from 'react';", ", useEffect } from 'react';", 1) if not m.group(1).strip() else s

anchor = "  const [model, setModel] = useState(defaultModel);"
assert s.count(anchor) == 1, 'model state anchor'
ADDED_STATE = """
  const [founder, setFounder] = useState(false);
  const [modelSelection, setModelSelection] = useState('best');
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.rpc('credit_summary');
        if (data && (data as any).founder) setFounder(true);
      } catch {}
    })();
  }, []);"""
s = s.replace(anchor, anchor + ADDED_STATE, 1)

anchor = """        mode: agentMode ? 'agent' : 'chat',
        model: useModel,"""
assert s.count(anchor) == 1, 'payload anchor'
s = s.replace(anchor, anchor + """
        ...(founder && modelSelection !== 'best' ? { model_selection: modelSelection } : {}),""", 1)

anchor = """            <button
              onClick={() =>
                setSafeMode((v) => {
                  localStorage.setItem('infora-safe-mode', v ? '0' : '1');
                  return !v;
                })
              }
              className={`btn-outline shrink-0 px-3 py-1.5 text-sm ${safeMode ? 'border-accent-500 text-accent-600 dark:text-accent-400' : ''}`}
              title="Safe Mode: review a token & cost flight plan before every send"
            >
              🛡 Safe
            </button>"""
assert s.count(anchor) == 1, 'safe button anchor'
SAFE_NEW = """            <button
              onClick={() =>
                setSafeMode((v) => {
                  localStorage.setItem('infora-safe-mode', v ? '0' : '1');
                  return !v;
                })
              }
              className={`btn-outline shrink-0 px-2.5 py-1.5 text-sm ${safeMode ? 'border-accent-500 text-accent-600 dark:text-accent-400' : ''}`}
              title="Safe Mode: review the estimated credits before every send"
            >
              🛡
            </button>"""
s = s.replace(anchor, SAFE_NEW, 1)

anchor = """            <button
              onClick={() => setAgentMode((v) => !v)}
              className={`btn-outline shrink-0 px-3 py-1.5 text-sm ${agentMode ? 'border-accent-500 text-accent-600 dark:text-accent-400' : ''}`}
              title="Agent mode: AI can search the web and read pages to complete tasks"
            >
              ⚡ Agent
            </button>"""
assert s.count(anchor) == 1, 'agent button anchor'
AGENT_NEW = """            <button
              onClick={() => {
                if (!agentMode && !window.confirm('Turn on Agent mode? The AI can search the web and read pages to complete bigger tasks (uses more credits).')) return;
                setAgentMode((v) => !v);
              }}
              className={`btn-outline shrink-0 px-2.5 py-1.5 text-sm ${agentMode ? 'border-accent-500 text-accent-600 dark:text-accent-400' : ''}`}
              title="Agent mode: AI can search the web and read pages to complete tasks"
            >
              ⚡
            </button>"""
s = s.replace(anchor, AGENT_NEW, 1)

FOUNDER_SELECT = '''            {founder && (
              <select
                value={modelSelection}
                onChange={(e) => setModelSelection(e.target.value)}
                className="input w-auto shrink-0 py-1.5 text-sm"
                title="Founder: model selection"
              >
                <option value="best">The Best</option>
                <option value="free">FREE</option>
                <optgroup label="Premium models">
                  <option value="deepseek/deepseek-v3.1">DeepSeek V3.1</option>
                  <option value="openai/gpt-5.6-luna">GPT-5.6 Luna</option>
                  <option value="openai/gpt-4o-mini">GPT-4o mini</option>
                  <option value="anthropic/claude-3.5-haiku-20241022">Claude Haiku</option>
                </optgroup>
                <optgroup label="Cheap models">
                  <option value="google/gemma-3-27b-it">Gemma 3 27B</option>
                  <option value="mistralai/mistral-nemo">Mistral Nemo</option>
                </optgroup>
                <optgroup label="All OpenRouter models">
                  {(modelsData?.models ?? []).map((m) => (
                    <option key={m.id} value={m.id}>{m.id}</option>
                  ))}
                </optgroup>
              </select>
            )}
'''
anchor = '\n            {speechSupported && ('
assert s.count(anchor) == 1, 'mic anchor'
s = s.replace(anchor, '\n' + FOUNDER_SELECT + '            {speechSupported && (', 1)

anchor = """            <p className="text-[10px] text-surface-400">Est. cost</p>
            <p className="text-sm font-semibold tabular-nums">{estCost === 0 ? 'Free' : `$${estCost.toFixed(4)}`}</p>"""
assert s.count(anchor) == 1, 'flightplan cost anchor'
CREDITS_NEW = """            <p className="text-[10px] text-surface-400">Est. credits</p>
            <p className="text-sm font-semibold tabular-nums">{estCost === 0 ? 'Free' : `${Math.max(1, Math.ceil(estCost * 8300))} credits`}</p>"""
s = s.replace(anchor, CREDITS_NEW, 1)

open(f'{root}/{C}', 'w').write(s)
print('patched Chat.tsx')

# ---------- Council.tsx: write from verified base64 ----------
b64 = pathlib.Path(__file__).with_name('council.tsx.b64').read_text().strip()
tsx = base64.b64decode(b64)
open(f'{root}/src/routes/Council.tsx', 'wb').write(tsx)
print('wrote Council.tsx from base64,', len(tsx), 'bytes')

print('Update 8 complete')
