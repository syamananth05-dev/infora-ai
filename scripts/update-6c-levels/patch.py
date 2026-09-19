import sys

root = sys.argv[1] if len(sys.argv) > 1 else '.'

def patch(path, pairs):
    p = f'{root}/{path}'
    s = open(p).read()
    for old, new in pairs:
        assert s.count(old) == 1, f'{path}: anchor not unique or missing: {old[:60]!r} (count={s.count(old)})'
        s = s.replace(old, new, 1)
    open(p, 'w').write(s)
    print(f'patched {path}')

# ---- api.ts: allow optional model + level param ----
patch('src/lib/api.ts', [
    ("  model: string;\n  mode?: 'chat' | 'agent';",
     "  model?: string;\n  level?: 1 | 2 | 3;\n  mode?: 'chat' | 'agent';"),
])

# ---- Chat.tsx: Level state + selector + payload ----
SELECT = (
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
patch('src/routes/Chat.tsx', [
    ('  const [listening, setListening] = useState(false);',
     '  const [listening, setListening] = useState(false);\n  const [level, setLevel] = useState<1 | 2 | 3>(1);'),
    ("        mode: agentMode ? 'agent' : 'chat',\n        model: useModel,",
     "        mode: agentMode ? 'agent' : 'chat',\n        ...(agentMode || opts?.model ? { model: useModel } : {}),\n        level,"),
    ('\n            {speechSupported && (',
     '\n' + SELECT + '            {speechSupported && ('),
])

# ---- Council.tsx: rename tier to Infora Level ----
patch('src/routes/Council.tsx', [
    ('>Tier</span>', '>Level</span>'),
    ('<option value="free">Free (\u20b90 \u2014 free models)</option>',
     '<option value="free">Infora Level 1 (free)</option>'),
    ('<option value="paid">Paid (premium models)</option>',
     '<option value="paid">Infora Level 3 (premium)</option>'),
    ("'Free tier runs on free AI models \u2014 no cost, subject to daily limits.'",
     "'Infora Level 1 runs on free models \u2014 \u20b90, subject to daily limits.'"),
    ("'Paid tier uses premium models and consumes credits from the platform AI account.'",
     "'Infora Level 3 uses premium models \u2014 founders have full access.'"),
])

# ---- Research.tsx: rename engine options ----
patch('src/routes/Research.tsx', [
    ('<option value="free">Free (\u20b90 \u2014 free models)</option>',
     '<option value="free">Infora Level 1 (free)</option>'),
    ('<option value="paid">Advanced (premium models)</option>',
     '<option value="paid">Infora Level 3 (premium)</option>'),
])

print('Update 6c complete')
