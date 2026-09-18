import os
import sys
import struct
import zlib

root = sys.argv[1] if len(sys.argv) > 1 else '.'
pub = os.path.join(root, 'public')

# ---------- 1. Icons (pure-python PNG, Infora logo: orange ring + dot on dark) ----------

def png_chunk(tag, data):
    return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

def write_icon(path, size):
    C = size / 2.0
    ring_out = size * 0.40
    ring_in = size * 0.30
    dot = size * 0.16
    orange = (255, 122, 26)
    bg = (13, 11, 9)
    ss = 3
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            hit = 0
            for sy in range(ss):
                for sx in range(ss):
                    dx = x + (sx + 0.5) / ss - C
                    dy = y + (sy + 0.5) / ss - C
                    d = (dx * dx + dy * dy) ** 0.5
                    if ring_in <= d <= ring_out or d <= dot:
                        hit += 1
            if hit:
                a = hit / (ss * ss)
                r = int(orange[0] * a + bg[0] * (1 - a))
                g = int(orange[1] * a + bg[1] * (1 - a))
                b = int(orange[2] * a + bg[2] * (1 - a))
            else:
                r, g, b = bg
            row += bytes((r, g, b))
        rows.append(bytes(row))
    data = b'\x89PNG\r\n\x1a\n'
    data += png_chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))
    data += png_chunk(b'IDAT', zlib.compress(b''.join(rows), 9))
    data += png_chunk(b'IEND', b'')
    open(path, 'wb').write(data)

os.makedirs(os.path.join(pub, 'icons'), exist_ok=True)
write_icon(os.path.join(pub, 'icons', 'icon-192.png'), 192)
write_icon(os.path.join(pub, 'icons', 'icon-512.png'), 512)

# ---------- 2. Manifest ----------

manifest = '''{
  "name": "Infora AI — Personal AI Platform",
  "short_name": "Infora",
  "description": "Your personal AI workspace: chats, agent, connectors, knowledge.",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#0d0b09",
  "theme_color": "#0d0b09",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
'''
open(os.path.join(pub, 'manifest.webmanifest'), 'w').write(manifest)

# ---------- 3. Service worker ----------

sw = '''const CACHE = 'infora-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(['./'])).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/rest/v1') || url.pathname.includes('/functions/v1') || url.pathname.includes('/auth/v1')) return;
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          const cp = r.clone();
          caches.open(CACHE).then((c) => c.put('./', cp));
          return r;
        })
        .catch(() => caches.match('./'))
    );
    return;
  }
  e.respondWith(caches.match(e.request).then((m) => m || fetch(e.request)));
});
'''
open(os.path.join(pub, 'sw.js'), 'w').write(sw)

# ---------- 4. Patch index.html ----------

ih = os.path.join(root, 'index.html')
s = open(ih).read()

anchor = '''    />
    <script>
      // Apply theme before paint to avoid flash'''
assert anchor in s, 'index.html anchor missing'

add = '''    />
    <link rel="manifest" href="./manifest.webmanifest" />
    <link rel="apple-touch-icon" href="icons/icon-192.png" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <script>
      // Apply theme before paint to avoid flash'''
s = s.replace(anchor, add, 1)
open(ih, 'w').write(s)

# ---------- 5. Patch src/main.tsx (register SW) ----------

mt = os.path.join(root, 'src', 'main.tsx')
m = open(mt).read()

tail_anchor = "</React.StrictMode>\n);"
assert tail_anchor in m, 'main.tsx anchor missing'
m = m.replace(tail_anchor, tail_anchor + """

if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
""", 1)
open(mt, 'w').write(m)

print('PWA build complete: icons + manifest + sw + index.html + main.tsx')
