import os
import sys

root = sys.argv[1] if len(sys.argv) > 1 else '.'

# ============ Patch VideoGen.tsx: Pro positioning ============

vp = os.path.join(root, 'src', 'routes', 'VideoGen.tsx')
s = open(vp).read()

old1 = '        Text to video, paid with credits. A video costs {videoCost} credits — charged only when it succeeds, never for failures.'
new1 = '        Text to video — a Pro feature, launching with Infora Pro subscriptions. Chat, research, documents, images, connectors and everything else stay free forever.'
assert old1 in s, 'subtitle anchor missing'
s = s.replace(old1, new1, 1)

old2 = "            {busy ? status || 'Working…' : `Generate video (${videoCost} credits)`}"
new2 = "            {busy ? status || 'Working…' : '🚀 Coming with Infora Pro'}"
assert old2 in s, 'button anchor missing'
s = s.replace(old2, new2, 1)

old3 = '          New accounts get 100 free credits. Top-ups are coming with subscriptions.'
new3 = '          Pro plans will include a monthly credit allowance (a video costs {videoCost} credits). Your balance carries over.'
assert old3 in s, 'note anchor missing'
s = s.replace(old3, new3, 1)

open(vp, 'w').write(s)

print('Update 4e patched: video positioned as Pro feature')
