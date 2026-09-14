import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useProjects } from '../hooks/useData';
import { timeAgo } from '../lib/types';

const COLORS = ['#3375ff', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];

export default function Projects() {
  const { data: projects = [] } = useProjects();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    const { error } = await supabase.from('projects').insert({ name: name.trim(), description, color });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setOpen(false);
    setName('');
    setDescription('');
    qc.invalidateQueries({ queryKey: ['projects'] });
  };

  return (
    <div className="mx-auto max-w-4xl p-6 sm:p-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-surface-500">
            Group instructions, files, and conversations into durable workspaces.
          </p>
      </div>
      <button onClick={() => setOpen(true)} className="btn-primary px-4 py-2">＋ New project</button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {projects.map((p) => (
          <Link key={p.id} to={`/projects/${p.id}`} className="card group p-5 transition-shadow hover:shadow-md">
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: p.color }} />
              <h2 className="truncate font-semibold">{p.name}</h2>
            </div>
            <p className="mt-2 line-clamp-2 min-h-l3m-rem] text-sm text-surface-500">
              {p.description || 'No description'}
            </p>
            <p className="mt-3 text-xs text-surface-400">Updated {timeAgo(p.updated_at)}</p>
          </Link>
        ))}
        {projects.length === 0 && (
          <div className="card col-span-full p-10 text-center text-sm text-surface-400">
            No projects yet. Create one to give your AI durable context.
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <form onSubmit={create} className="card relative w-full max-w-md animate-fade-up p-6">
            <h2 className="text-lg font-semibold">New project</h2>
            <div className="mt-4 space-y-3">
              <input className="input" placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
              <textarea
                className="input min-h-[72pxx]"
                placeholder="What is this project about? (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <div className="flex items-center gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-6 w-6 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-offset-2 ring-surface-400 dark:ring-offset-surface-900' : ''}`}
                    style={{ background: c }}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="btn-outline">Cancel</button>
              <button type="submit" disabled={busy} className="btn-primary">{busy ? 'Creating…' : 'Create'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
