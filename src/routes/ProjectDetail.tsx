import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useProjects } from '../hooks/useData';
import { timeAgo, type Conversation } from '../lib/types';
import { useState } from 'react';

export default function ProjectDetail() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: projects = [] } = useProjects();
  const project = projects.find((p) => p.id === projectId);

  const [instructions, setInstructions] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<'instructions' | 'chats'>('instructions');

  const { data: chats = [] } = useQuery({
    queryKey: ['project-chats', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('project_id', projectId!)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data as Conversation[];
    },
  });

  if (!project) {
    return (
      <div className="p-10 text-center text-sm text-surface-400">
        Project not found. <Link to="/projects" className="text-accent-600">Back to projects</Link>
      </div>
    );
  }

  const currentInstructions = instructions ?? project.instructions ?? '';

  const saveInstructions = async () => {
    await supabase.from('projects').update({ instructions: currentInstructions }).eq('id', project.id);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    qc.invalidateQueries({ queryKey: ['projects'] });
  };

  const deleteProject = async () => {
    if (!confirm(`Delete project "${project.name}"? Chats will be kept but unlinked.`)) return;
    await supabase.from('projects').delete().eq('id', project.id);
    qc.invalidateQueries({ queryKey: ['projects'] });
    navigate('/projects');
  };

  return (
    <div className="mx-auto max-w-3xl p-6 sm:p-10">
      <header className="mb-6">
        <Link to="/projects" className="text-xs text-surface-400 hover:text-accent-600">← All projects</Link>
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: project.color }} />
            <h1 className="truncate text-2xl font-semibold tracking-tight">{project.name}</h1>
          </div>
          <button onClick={deleteProject} className="btn-outline text-red-500">Delete</button>
        </div>
        {project.description && <p className="mt-1 text-sm text-surface-500">{project.description}</p>}
      </header>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-surface-200 dark:border-surface-800">
        {(['instructions', 'chats'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm capitalize ${
              tab === t
                ? 'border-accent-500 font-medium text-accent-600 dark:text-accent-400'
                : 'border-transparent text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
            }`}
          >
            {t === 'chats' ? `chats (${chats.length})` : t}
          </button>
        ))}
        <span className="ml-auto self-center text-[10px] uppercase tracking-wider text-surface-400">
          Knowledge & agents: Phase 2/3
        </span>
      </div>

      {tab === 'instructions' && (
        <div>
          <p className="mb-2 text-sm text-surface-500">
            These instructions are injected into every chat in this project.
          </p>
          <textarea
            className="input min-h-[220px] font-mono text-[13px] leading-6"
            placeholder="e.g. You are assisting with procurement analysis. Always reference supplier lead times. Use metric units…"
            value={currentInstructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
          <button onClick={saveInstructions} className="btn-primary mt-3">
            {saved ? '✓ Saved' : 'Save instructions'}
          </button>
        </div>
      )}

      {tab === 'chats' && (
        <div className="card divide-y divide-surface-100 dark:divide-surface-800">
          {chats.map((c) => (
            <Link
              key={c.id}
              to={`/chat/${c.id}`}
              className="flex items-center justify-between px-4 py-3 text-sm hover:bg-surface-50 dark:hover:bg-surface-800/60"
            >
              <span className="truncate">{c.title}</span>
              <span className="ml-3 shrink-0 text-xs text-surface-400">{timeAgo(c.updated_at)}</span>
            </Link>
          ))}
          {chats.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-surface-400">
              No chats in this project yet —{' '}
              <Link to="/chat?project={project.id}" className="text-accent-600 dark:text-accent-400">
                start one
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
