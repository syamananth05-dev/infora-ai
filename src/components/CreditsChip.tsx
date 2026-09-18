import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../hooks/useSession';

export default function CreditsChip() {
  const { session } = useSession();
  const [balance, setBalance] = useState<number | null>(null);
  const [founder, setFounder] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('video', { body: { action: 'balance' } });
      if (!error && data) {
        if (data.founder) {
          setFounder(true);
          setBalance(null);
        } else {
          setFounder(false);
          if (typeof data.balance === 'number') setBalance(data.balance);
        }
      }
    } catch {}
    setLoading(false);
  }, [session]);

  useEffect(() => {
    refresh();
    const iv = window.setInterval(refresh, 300000);
    return () => window.clearInterval(iv);
  }, [refresh]);

  if (!session) return null;

  return (
    <button
      onClick={refresh}
      title="Your credits. Founder accounts have unlimited access. Videos cost 10 credits - everything else is free. Tap to refresh."
      className="mx-2 mb-2 mt-1 flex w-[calc(100%-1rem)] items-center justify-between rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-left"
    >
      <span className="text-xs font-medium text-primary">⚡ Credits</span>
      <span className="text-sm font-bold text-primary">
        {founder ? '∞' : loading && balance === null ? '…' : balance === null ? '—' : balance}
      </span>
    </button>
  );
}
