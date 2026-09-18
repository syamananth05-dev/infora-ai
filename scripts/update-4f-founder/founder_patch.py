import os
import sys

root = sys.argv[1] if len(sys.argv) > 1 else '.'

# ============ Patch VideoGen.tsx ============

vp = os.path.join(root, 'src', 'routes', 'VideoGen.tsx')
s = open(vp).read()

old = "  const [balance, setBalance] = useState<number | null>(null);"
new = "  const [balance, setBalance] = useState<number | null>(null);\n  const [founder, setFounder] = useState(false);"
assert old in s, 'VideoGen balance anchor missing'
s = s.replace(old, new, 1)

old = "      if (!fnError && data?.balance !== undefined) {\n        setBalance(data.balance);\n        if (data.video_cost) setVideoCost(data.video_cost);\n      }"
new = "      if (!fnError && data) {\n        if (data.founder) {\n          setFounder(true);\n          setBalance(null);\n        } else {\n          setFounder(false);\n          if (data.balance !== undefined) setBalance(data.balance);\n        }\n        if (data.video_cost) setVideoCost(data.video_cost);\n      }"
assert old in s, 'VideoGen refresh anchor missing'
s = s.replace(old, new, 1)

old = "        {balance !== null ? (\n          <span className=\"rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary\">\n            ⚡ {balance} credits\n          </span>\n        ) : null}"
new = "        {founder || balance !== null ? (\n          <span className=\"rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary\">\n            ⚡ {founder ? '∞' : balance} credits\n          </span>\n        ) : null}"
assert old in s, 'VideoGen pill anchor missing'
s = s.replace(old, new, 1)

old = "          {balance !== null && balance < videoCost ? ("
new = "          {!founder && balance !== null && balance < videoCost ? ("
assert old in s, 'VideoGen warning anchor missing'
s = s.replace(old, new, 1)

open(vp, 'w').write(s)

# ============ Patch CreditsChip.tsx ============

cp = os.path.join(root, 'src', 'components', 'CreditsChip.tsx')
c = open(cp).read()

old = "  const [balance, setBalance] = useState<number | null>(null);"
new = "  const [balance, setBalance] = useState<number | null>(null);\n  const [founder, setFounder] = useState(false);"
assert old in c, 'Chip balance anchor missing'
c = c.replace(old, new, 1)

old = "      if (!error && data && typeof data.balance === 'number') setBalance(data.balance);"
new = "      if (!error && data) {\n        if (data.founder) {\n          setFounder(true);\n          setBalance(null);\n        } else {\n          setFounder(false);\n          if (typeof data.balance === 'number') setBalance(data.balance);\n        }\n      }"
assert old in c, 'Chip refresh anchor missing'
c = c.replace(old, new, 1)

old = "        {loading && balance === null ? '…' : balance === null ? '—' : balance}"
new = "        {founder ? '∞' : loading && balance === null ? '…' : balance === null ? '—' : balance}"
assert old in c, 'Chip display anchor missing'
c = c.replace(old, new, 1)

old = '      title="Your credits. Videos cost 10 credits - everything else is free. Tap to refresh."'
new = '      title="Your credits. Founder accounts have unlimited access. Videos cost 10 credits - everything else is free. Tap to refresh."'
assert old in c, 'Chip title anchor missing'
c = c.replace(old, new, 1)

open(cp, 'w').write(c)

print('Update 4f patched: founder tier display in VideoGen + CreditsChip')
