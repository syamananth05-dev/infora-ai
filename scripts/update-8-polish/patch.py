import sys

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

# ---------- api.ts: model_selection field ----------
patch('src/lib/api.ts', [
    ("  level?: 1 | 2 | 3;",
     "  level?: 1 | 2 | 3;\n  model_selection?: string;"),
])

# ---------- Chat.tsx ----------
C = 'src/routes/Chat.tsx'
s = open(f'{root}/{C}').read()

if "from '../lib/supabase'" not in s:
    anchor = "import { useModels, useSession } from '../hooks/useSession';"
    assert s.count(anchor) == 1
    s = s.replace(anchor, anchor + "\nimport { supabase } from '../lib/supabase';", 1)

anchor = "  const [model, setModel] = useState(defaultModel);"
assert s.count(anchor) == 1
s = s.replace(anchor, anchor + """
  const [founder, setFounder] = useState(false);
  const [modelSelection, setModelSelection] = useState('best');
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.rpc('credit_summary');
        if (data && (data as any).founder) setFounder(true);
      } catch {}
    })();
  }, []);""", 1)

anchor = """        mode: agentMode ? 'agent' : 'chat',
        model: useModel,"""
assert s.count(anchor) == 1
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
assert s.count(anchor) == 1
s = s.replace(anchor, """            <button
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
            </button>""", 1)

anchor = """            <button
              onClick={() => setAgentMode((v) => !v)}
              className={`btn-outline shrink-0 px-3 py-1.5 text-sm ${agentMode ? 'border-accent-500 text-accent-600 dark:text-accent-400' : ''}`}
              title="Agent mode: AI can search the web and read pages to complete tasks"
            >
              ⚡ Agent
            </button>"""
assert s.count(anchor) == 1
s = s.replace(anchor, """            <button
              onClick={() => {
                if (!agentMode && !window.confirm('Turn on Agent mode? The AI can search the web and read pages to complete bigger tasks (uses more credits).')) return;
                setAgentMode((v) => !v);
              }}
              className={`btn-outline shrink-0 px-2.5 py-1.5 text-sm ${agentMode ? 'border-accent-500 text-accent-600 dark:text-accent-400' : ''}`}
              title="Agent mode: AI can search the web and read pages to complete tasks"
            >
              ⚡
            </button>""", 1)

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
assert s.count(anchor) == 1
s = s.replace(anchor, '\n' + FOUNDER_SELECT + '            {speechSupported && (', 1)

anchor = """            <p className="text-[10px] text-surface-400">Est. cost</p>
            <p className="text-sm font-semibold tabular-nums">{estCost === 0 ? 'Free' : `$${estCost.toFixed(4)}`}</p>"""
assert s.count(anchor) == 1
s = s.replace(anchor, """            <p className="text-[10px] text-surface-400">Est. credits</p>
            <p className="text-sm font-semibold tabular-nums">{estCost === 0 ? 'Free' : `${Math.max(1, Math.ceil(estCost * 8300))} credits`}</p>""", 1)

open(f'{root}/{C}', 'w').write(s)
print('patched Chat.tsx')

# ---------- Council.tsx: full rewrite (v5) — written via base64 to keep encoding safe ----------
import base64
COUNCIL_B64 = (
'aW1wb3J0IHsgdXNlU3RhdGUgfSBmcm9tICdyZWFjdCc7CmltcG9ydCB7IHN1cGFi
c2UgfSBmcm9tICcuLi9saWIvc3VwYWJhc2UnOwoKY29uc3QgUEVSU09OQVMgPSBbCiAgeyBpZDogJ2RlZXBf
cmVzZWFyY2gnLCBuYW1lOiAnRGVlcCBSZXNlYXJjaCBFeHBlcnQnLCBlbW9qaTogJ8KP8o+OJyB9LAogIHsg
aWQ6ICdwcm9ibGVtX3NvbHZpbmcnLCBuYW1lOiAnUHJvYmxlbS1Tb2x2aW5nIFN0cmF0ZWdpc3QnLCBlbW9q
aTogJ17pl6AnIH0sCiAgeyBpZDogJ2J1c2luZXNzJywgbmFtZTogJ0J1c2luZXNzIEFuYWx5c3QnLCBlbW9q
aTogJ8KPFOKAkyIH0sCiAgeyBpZDogJ2NvZGluZycsIG5hbWU6ICdDb2RpbmcgQXJjaGl0ZWN0JywgZW1v
amk6ICdfLh9QscKkJyB9LAogIHsgaWQ6ICdkYXRhX3NjaWVuY2UnLCBuYW1lOiAnRGF0YSBTY2llbnRpc3Qn
LCBlbW9qaTogJ8KPFMKAmyB9LAogIHsgaWQ6ICdtYXRoJywgbmFtZTogJ01hdGggR2VuaXVzJywgZW1vamk6
ICdfLn2ZomzhuqInIH0sCiAgeyBpZDogJ2NyZWF0aXZlJywgbmFtZTogJ0NyZWF0aXZlIFdyaXRlcicsIGVt
b2ppOiAn4paDIsOJUicgfSwKICB7IGlkOiAnbGVnYWwnLCBuYW1lOiAnTGVnYWwgQWR2aXNvcicsIGVtb2pp
OiAn4p2k77iPJyB9LAogIHsgaWQ6ICdmaW5hbmNlJywgbmFtZTogJ0ZpbmFuY2UgRXhwZXJ0JywgZW1vamk6
ICdfLh9Qvw5YJyB9LAogIHsgaWQ6ICdtYXJrZXRpbmcnLCBuYW1lOiAnTWFya2V0aW5nIFN0cmF0ZWdp
c3QnLCBlbW9qaTogJ8KPgO+KkyB9LAogIHsgaWQ6ICdzY2llbmNlJywgbmFtZTogJ1NjaWVudGlmaWMgQW5h
bHlzdCcsIGVtb2ppOiAn4pOQnCcgfSwKICB7IGlkOiAnaGlzdG9yeScsIG5hbWU6ICdIaXN0b3J5IFNjaG9s
YXInLCBlbW9qaTogJ8KQnPCrUCcgfSwKICB7IGlkOiAnbWVkaWNhbCcsIG5hbWU6ICdNZWRpY2FsIEluZm9y
bWF0aW9uIEV4cGVydCcsIGVtb2ppOiAn6qGvIAJ9LAogIHsgaWQ6ICdjYXJlZXInLCBuYW1lOiAnQ2FyZWVy
IENvdW5zZWxvcicsIGVtb2ppOiAn4pntnScgfSwKICB7IGlkOiAncHN5Y2hvbG9neScsIG5hbWU6ICdQc3lj
aG9sb2dpc3QgJiBDb2FjaCcsIGVtb2ppOiAn4p6QmCcgfSwKICB7IGlkOiAnc2tlcHRpYycsIG5hbWU6
IiBEZXZpbCdzIEFkdm9jYXRlIiwgZW1vamk6ICfwn5K8IiB9LAogIHsgaWQ6ICd0ZWFjaGVyJywgbmFtZTog
J1RlYWNoZXIgJiBFeHBsYWluZXInLCBlbW9qaTogJ8KPmsKtwrvLo8KkJyB9LAogIHsgaWQ6ICdsaW5ndWlz
dCcsIG5hbWU6ICdUcmFuc2xhdG9yICYgTGFuZ3Vpc3QnLCBlbW9qaTogJ8KPli4nIH0sCiAgeyBpZDogJ3Rl
Y2hfdHJlbmRzJywgbmFtZTogJ1RlY2ggVHJlbmQgQW5hbHlzdCcsIGVtb2ppOiAn8J+TpycgfSwKICB7IGlk
OiAnZWRpdG9yJywgbmFtZTogJ0Vzc2F5IEVkaXRvcicsIGVtb2ppOiAn4pLmlCcETY0pcgIH0sCl07Cgpp
bnRlcmZhY2UgQW5zd2VyIHsKICBwZXJzb25hOiBzdHJpbmc7CiAgZW1vamk6IHN0cmluZzsKICBjb250ZW50
OiBzdHJpbmc7CiAgb2s6IGJvb2xlYW47Cn0K'
)
# NOTE: placeholder - real content assembled below
print('assembling Council.tsx')
