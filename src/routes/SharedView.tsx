import { useEffect, useState } from 'react';
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
              <p className="text-xs font-medium text-surface-400">{m.role === 'user' ? 'Question' : m.role === 'assistant' ? 'Infora' : m.role}</p>
              <div className="mt-2 whitespace-pre-wrap text-sm">{m.content}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
