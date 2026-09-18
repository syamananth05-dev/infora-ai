import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSession } from '../hooks/useSession';

interface TaskRow {
  id: string;
  name: string;
  prompt: string;
  schedule_kind: string;
  schedule_hour: number;
  every_minutes: number;
  active: boolean;
  last_run: string | null;
  next_run: string;
}

interface RunRow {
  id: string;
  task_id: string;
  status: string;
  result: string | null;
  created_at: string;
}

function nextDailyIst(hour: number): string {
  const now = new Date();
  const target = new Date(now);
  target.setUTCHours(((hour - 6) + 24) % 24, 30, 0, 0);
  if (target.getTime() <= now.getTime()) target.setUTCDate(target.getUTCDate() + 1);
  return target.toISOString();
}

export default function Tasks() {
  const { session } = useSession();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [kind, setKind] = useState('daily');
  const [hour, setHour] = useState(9);
  const [everyHours, setEveryHours] = useState(6);
  const [busy, setBusy] = useState(false);
  const [openTask, setOpenTask] = useState<string | null>(null);

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['scheduled_tasks'],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from('scheduled_tasks').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as TaskRow[];
    },
  });

  const { data: runs = [] } = useQuery({
    queryKey: ['task_runs', openTask],
    enabled: !!openTask,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_runs')
        .select('*')
        .eq('task_id', openTask)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as RunRow[];
    },
  });

  const createTask = async () => {
    if (busy || !name.trim() || !prompt.trim()) return;
    setBusy(true);
    try {
      const next_run = kind === 'daily' ? nextDailyIst(hour) : new Date(Date.now() + everyHours * 3600000).toISOString();
      const { error } = await supabase.from('scheduled_tasks').insert({
        user_id: session!.user.id,
        name: name.trim(),
        prompt: prompt.trim(),
        schedule_kind: kind,
        schedule_hour: hour,
        every_minutes: everyHours * 60,
        next_run,
      });
      if (error) throw error;
      setName('');
      setPrompt('');
      qc.invalidateQueries({ queryKey: ['scheduled_tasks'] });
    } catch (e: any) {
      window.alert('Could not create task: ' + (e?.message || 'unknown error'));
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (t: TaskRow) => {
    const { error } = await supabase.from('scheduled_tasks').update({ active: !t.active }).eq('id', t.id);
    if (error) {
      window.alert('Could not update: ' + error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ['scheduled_tasks'] });
  };

  const deleteTask = async (t: TaskRow) => {
    if (!window.confirm(`Delete task "${t.name}" and its history?`)) return;
    const { error } = await supabase.from('scheduled_tasks').delete().eq('id', t.id);
    if (error) {
      window.alert('Could not delete: ' + error.message);
      return;
    }
    if (openTask === t.id) setOpenTask(null);
    qc.invalidateQueries({ queryKey: ['scheduled_tasks'] });
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold">⏰ Scheduled Tasks</h1>
      <p className="mt-1 text-sm text-surface-500">
        Infora runs these automatically in the background (with web search) and saves the results here.
      </p>

      <div className="mt-4 rounded-xl border border-surface-200 bg-surface-50 p-4 dark:border-surface-800 dark:bg-surface-900">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Task name, e.g. Morning AI news"
          className="input w-full"
        />
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="What should Infora do? e.g. Summarize the top 5 AI news stories of the last 24h with links"
          className="input mt-2 w-full"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="input">
            <option value="daily">Every day at</option>
            <option value="interval">Every N hours</option>
          </select>
          {kind === 'daily' ? (
            <select value={hour} onChange={(e) => setHour(Number(e.target.value))} className="input">
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00 IST
                </option>
              ))}
            </select>
          ) : (
            <select value={everyHours} onChange={(e) => setEveryHours(Number(e.target.value))} className="input">
              {[1, 2, 3, 6, 12].map((h) => (
                <option key={h} value={h}>
                  every {h}h
                </option>
              ))}
            </select>
          )}
          <button onClick={createTask} disabled={busy || !name.trim() || !prompt.trim()} className="btn-primary ml-auto">
            {busy ? 'Creating…' : 'Create task'}
          </button>
        </div>
      </div>

      {isLoading ? (
        <p className="mt-4 text-sm text-surface-400">Loading…</p>
      ) : tasks.length === 0 ? (
        <p className="mt-4 text-sm text-surface-400">
          No tasks yet. Example: "Morning AI news" daily at 09:00 IST — "Summarize the top 5 AI news stories with links."
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {tasks.map((t) => (
            <li
              key={t.id}
              className="rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 dark:border-surface-800 dark:bg-surface-900"
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => setOpenTask(openTask === t.id ? null : t.id)}
                  className="min-w-0 text-left"
                >
                  <p className="truncate text-sm font-medium">
                    {t.active ? '' : '⏸ '}
                    {t.name}
                  </p>
                  <p className="text-xs text-surface-400">
                    {t.schedule_kind === 'daily'
                      ? `daily ${String(t.schedule_hour).padStart(2, '0')}:00 IST`
                      : `every ${t.every_minutes / 60}h`}
                    {' · next: ' + new Date(t.next_run).toLocaleString()}
                  </p>
                </button>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => toggleActive(t)} className="rounded px-2 py-1 text-xs text-surface-400 hover:text-primary">
                    {t.active ? 'Pause' : 'Resume'}
                  </button>
                  <button onClick={() => deleteTask(t)} className="rounded px-2 py-1 text-xs text-surface-400 hover:bg-red-500/10 hover:text-red-500">
                    Delete
                  </button>
                </div>
              </div>
              {openTask === t.id ? (
                <div className="mt-2 border-t border-surface-200 pt-2 dark:border-surface-800">
                  <p className="text-xs text-surface-400">Prompt: {t.prompt}</p>
                  {runs.length === 0 ? (
                    <p className="mt-2 text-xs text-surface-400">No runs yet — results appear here automatically.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {runs.map((r) => (
                        <details key={r.id} className="rounded border border-surface-200 p-2 dark:border-surface-800">
                          <summary className="cursor-pointer text-xs text-surface-400">
                            {r.status === 'ok' ? '✅' : '❌'} {new Date(r.created_at).toLocaleString()}
                          </summary>
                          <div className="prose prose-sm mt-2 max-w-none whitespace-pre-wrap text-sm">{r.result}</div>
                        </details>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
