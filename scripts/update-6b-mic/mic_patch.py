import sys

root = sys.argv[1] if len(sys.argv) > 1 else '.'
p = f'{root}/src/routes/Chat.tsx'
s = open(p).read()

old = '    rec.continuous = false;'
assert old in s, 'anchor continuous missing'
s = s.replace(old, '    rec.continuous = true;\n    rec.maxAlternatives = 1;', 1)

old = '    rec.onend = () => setListening(false);'
assert old in s, 'anchor onend missing'
new = (
    '    rec.onend = () => {\n'
    '      if (recRef.current === rec) {\n'
    '        try { rec.start(); } catch { setListening(false); }\n'
    '      } else {\n'
    '        setListening(false);\n'
    '      }\n'
    '    };'
)
s = s.replace(old, new, 1)

old = '      try { recRef.current?.stop(); } catch {}'
assert old in s, 'anchor stop missing'
s = s.replace(old, '      try { recRef.current?.stop(); recRef.current = null; } catch {}', 1)

open(p, 'w').write(s)
print('Update 6b patched: continuous mic + auto-restart')
