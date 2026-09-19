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

# ---------- 1. Mic: continuous-mode duplication fix ----------
# Chrome re-delivers results in continuous=true mode, so finals were appended
# repeatedly. Switch to one utterance per session (fresh e.results each start,
# no re-append) and restart the SAME object on end for hands-free dictation.
patch('src/routes/Chat.tsx', [
    (r'''  const toggleMic = () => {
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (listening) {
      try { recRef.current?.stop(); recRef.current = null; } catch {}
      return;
    }
    const rec = new SR();
    rec.lang = "en-IN";
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 1;
    let finalText = "";
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      setInput((finalText + interim).replace(/\s+/g, " ").trimStart());
    };
    rec.onend = () => {
      if (recRef.current === rec) {
        try { rec.start(); } catch { setListening(false); }
      } else {
        setListening(false);
      }
    };
    rec.onerror = (e: any) => {
      const err = String(e?.error || '');
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        recRef.current = null;
        try { rec.stop(); } catch {}
        setListening(false);
        alert('Microphone access is blocked. Allow mic permission for this site (tap the lock / site-settings icon in your browser), then tap the mic again.');
      }
      // 'no-speech', 'network', 'aborted' are transient - onend auto-restarts
    };
    recRef.current = rec;
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  };''',
     r'''  const toggleMic = () => {
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (listening) {
      try { recRef.current?.stop(); } catch {}
      recRef.current = null;
      setListening(false);
      return;
    }
    const rec = new SR();
    rec.lang = 'en-IN';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    const base = input;
    let finals = '';
    rec.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finals += r[0].transcript + ' ';
        else interim += r[0].transcript;
      }
      setInput(((base ? base + ' ' : '') + finals + interim).trimStart());
    };
    rec.onend = () => {
      if (recRef.current === rec) {
        try { rec.start(); } catch { setListening(false); }
      } else {
        setListening(false);
      }
    };
    rec.onerror = (e: any) => {
      const err = String(e?.error || '');
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        recRef.current = null;
        try { rec.stop(); } catch {}
        setListening(false);
        alert('Microphone access is blocked. Allow mic permission for this site (tap the lock / site-settings icon in your browser), then tap the mic again.');
      }
      // 'no-speech', 'network', 'aborted' are transient - onend auto-restarts
    };
    recRef.current = rec;
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  };'''),

    # ---------- 2. Messages container: min-h-0 so long chats never push the header away ----------
    (r'''      <div ref={scrollRef} className="flex-1 overflow-y-auto">''',
     r'''      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">'''),

    # ---------- 3. Sticky header (belt and suspenders) ----------
    (r'''      <header className="flex items-center gap-2 border-b border-surface-200 px-3 py-2 dark:border-surface-800">''',
     r'''      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-surface-200 bg-surface-50/95 px-3 py-2 backdrop-blur dark:border-surface-800 dark:bg-surface-900/95">'''),
])

# ---------- 4. Mobile-safe viewport height (URL-bar safe on phones) ----------
patch('src/components/AppLayout.tsx', [
    (r'''    <div className="flex h-screen overflow-hidden">''',
     r'''    <div className="flex h-dvh overflow-hidden">'''),
])

# ---------- 5. Global: never allow horizontal page scroll ----------
css_path = f'{root}/src/index.css'
css = open(css_path).read()
APPEND = '''

/* ---- Device compatibility: no horizontal page scroll, ever ---- */
html,
body {
  overflow-x: hidden;
  max-width: 100vw;
}

.md-body p,
.md-body li,
.md-body h1,
.md-body h2,
.md-body h3,
.md-body h4,
.md-body code {
  overflow-wrap: anywhere;
}

.md-body table {
  display: block;
  overflow-x: auto;
  max-width: 100%;
}

.md-body img {
  max-width: 100%;
  height: auto;
}
'''
if 'no horizontal page scroll' not in css:
    css += APPEND
    open(css_path, 'w').write(css)
    print('appended css rules')
else:
    print('css rules already present')

print('Update 14 complete')
