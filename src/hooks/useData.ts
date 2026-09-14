import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Conversation, Project } from '../lib/types';
import { useSession } from './useSession';

export function useConversations(includeArchived = false) {
  const { session } = useSession();
  return useQuery({
    queryKey: ['conversations', includeArchived],
    enabled: !!session,
    queryFn: async () => {
      let q = supabase
        .from('conversations')
        .select('*')
        .order('pinned', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(200);
      if (!includeArchived) q = q.eq('archived', false);
      const { data, error } = await q;
      if (error) throw error;
      return data as Conversation[];
    },
  });
}

export function useConversation(id: string | undefined) {
  return useQuery({
    queryKey: ['conversation', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('conversations').select('*').eq('id', id!).single();
      if (error) throw error;
      return data as Conversation;
    },
  });
}

export function useProjects() {
  const { session } = useSession();
  return useQuery({
    queryKey: ['projects'],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('archived', false)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data as Project[];
    },
  });
}
