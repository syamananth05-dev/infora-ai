import sys

root = sys.argv[1] if len(sys.argv) > 1 else '.'

p = f'{root}/src/routes/Chat.tsx'
s = open(p).read()
old = "setModel(v === 'best' ? '' : v === 'free' ? 'meta-llama/llama-3.3-70b-instruct:free' : v);"
new = "setModel(v === 'best' ? '' : v === 'free' ? 'deepseek/deepseek-v4-flash-0731:free' : v);"
n = s.count(old)
if n != 1:
    raise SystemExit(f'anchor count={n}')
open(p, 'w').write(s.replace(old, new, 1))
print('patched Chat.tsx free model -> deepseek-v4-flash:free')
