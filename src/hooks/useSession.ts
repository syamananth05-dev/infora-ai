import { useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { fetchModels } from '../lib/api';

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, loading };
}

export function useProfile() {
  const { session } = useSession();
  return useQuery({
    queryKey: ['profile', session?.user?.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', session!.user.id).single();
      if (error) throw error;
      return data;
    },
  });
}

export function useModels() {
  const { session } = useSession();
  return useQuery({
    queryKey: ['models'],
    enabled: !!session,
    staleTime: 10 * 60 * 1000,
    queryFn: fetchModels,
  });
}
