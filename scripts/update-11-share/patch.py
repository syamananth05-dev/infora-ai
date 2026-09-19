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

# ---------- App.tsx: SharedView route ----------
patch('src/App.tsx', [
    ("import PublicReport from './routes/PublicReport';",
     "import PublicReport from './routes/PublicReport';\nimport SharedView from './routes/SharedView';"),
    ('        <Route path="/r/:id" element={<PublicReport />} />',
     '        <Route path="/r/:id" element={<PublicReport />} />\n        <Route path="/s/:id" element={<SharedView />} />'),
])

# ---------- main.tsx: capture ?ref= invite codes ----------
patch('src/main.tsx', [
    ("ReactDOM.createRoot(document.getElementById('root')!).render(",
     """try {
  const refParam = new URLSearchParams(window.location.search).get('ref');
  if (refParam) localStorage.setItem('infora-ref', refParam);
} catch {}

ReactDOM.createRoot(document.getElementById('root')!).render("""),
])

# ---------- Chat.tsx: share conversation ----------
patch('src/routes/Chat.tsx', [
    ("""  const [editingId, setEditingId] = useState<string | null>(null);""",
     """  const shareChat = async () => {
    const messages = display.map((m) => ({ role: m.role, content: m.content }));
    const { data, error } = await supabase.rpc('create_shared_link', {
      p_title: conv?.title || 'Shared conversation',
      p_messages: { messages },
    });
    if (error || !data) {
      alert('Could not create share link.');
      return;
    }
    const url = `${window.location.origin}${import.meta.env.BASE_URL}s/${data}`;
    try { await navigator.clipboard.writeText(url); } catch {}
    alert(`Share link copied:\n${url}`);
  };

  const [editingId, setEditingId] = useState<string | null>(null);"""),
    ("""        <button onClick={exportChat} className=\"icon-btn\" title=\"Export\">⤓</button>""",
     """        <button onClick={shareChat} className=\"icon-btn\" title=\"Share: copy a public link to this conversation\">🔗</button>
        <button onClick={exportChat} className=\"icon-btn\" title=\"Export\">⤓</button>"""),
])

# ---------- CreditsChip.tsx: referral apply + invite link copy ----------
patch('src/components/CreditsChip.tsx', [
    ("""  const [founder, setFounder] = useState(false);
  const [loading, setLoading] = useState(false);""",
     """  const [founder, setFounder] = useState(false);
  const [refCode, setRefCode] = useState('');
  const [loading, setLoading] = useState(false);"""),
    ("""      const { data, error } = await supabase.rpc('credit_summary');
      if (!error && data) {
        setFounder(!!(data as any).founder);
        if (!(data as any).founder && typeof (data as any).available === 'number') {
          setAvailable((data as any).available);
        }
      }
    } catch {}""",
     """      const { data, error } = await supabase.rpc('credit_summary');
      if (!error && data) {
        setFounder(!!(data as any).founder);
        if (!(data as any).founder && typeof (data as any).available === 'number') {
          setAvailable((data as any).available);
        }
      }
      const storedRef = localStorage.getItem('infora-ref');
      if (storedRef) {
        localStorage.removeItem('infora-ref');
        try { await supabase.rpc('set_referral', { p_code: storedRef }); } catch {}
      }
      if (data && (data as any).daily_spent > 0) {
        try { await supabase.rpc('apply_referral_reward'); } catch {}
      }
      const { data: prof } = await supabase.from('profiles').select('referral_code').single();
      if (prof && (prof as any).referral_code) setRefCode((prof as any).referral_code);
    } catch {}"""),
    ("""      onClick={refresh}
      title=\"Your credits. Daily credits refresh at midnight; your joining bonus never expires. Tap to refresh.\"""",
     """      onClick={async () => {
        if (refCode) {
          const link = `${window.location.origin}${import.meta.env.BASE_URL}?ref=${refCode}`;
          try { await navigator.clipboard.writeText(link); } catch {}
        }
        refresh();
      }}
      title=\"Your credits. Tap to copy your invite link — your friend gets +200 credits, you get +300 when they start using Infora.\""""),
])

# ---------- SharedView.tsx: public read-only shared conversations ----------
SHARED = r'''import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface SharedMessage {
  role: string;
  content: string;
}

export default function SharedView() {
  const { id } = useParams();
  const [title, setTitle] = useState('');
  const [messages, setMessages] = useState<SharedMessage[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error: err } = await supabase
        .from('shared_links')
        .select('title, payload, created_at')
        .eq('id', id!)
        .single();
      if (err || !data) {
        setError('This share link does not exist or has been removed.');
      } else {
        setTitle(data.title || 'Shared conversation');
        const p = data.payload as { messages?: SharedMessage[] };
        setMessages(p?.messages ?? []);
      }
      setLoading(false);
    })();
  }, [id]);

  return (
    <div className="min-h-screen bg-surface-50 px-4 py-8 dark:bg-surface-950">
      <div className="mx-auto max-w-3xl">
        <p className="text-center text-xs text-surface-400">
          Shared from Infora AI — <Link to="/auth" className="text-accent-600 hover:underline">try it free</Link>
        </p>
        <h1 className="mt-3 text-center text-xl font-semibold">{title}</h1>
        {loading && <p className="mt-8 text-center text-sm text-surface-400">Loading…</p>}
        {error && <p className="mt-8 text-center text-sm text-red-500">{error}</p>}
        <div className="mt-6 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`card p-4 ${m.role === 'user' ? '' : 'border-accent-500/30'}`}>
              <p className="text-xs font-medium text-surface-400">{m.role === 'user' ? 'Question' : 'Infora'}</p>
              <div className="mt-2 whitespace-pre-wrap text-sm">{m.content}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
'''
open(f'{root}/src/routes/SharedView.tsx', 'w').write(SHARED)
print('wrote SharedView.tsx')

print('Update 11 complete')
