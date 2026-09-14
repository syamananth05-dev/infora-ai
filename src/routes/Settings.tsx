import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSession, useProfile, useModels } from '../hooks/useSession';
import { useThemeStore } from '../lib/stores';
import { downloadFile } from '../lib/api';
import { formatCost, formatTokens } from '../lib/types';
import type { UsageRow } from '../lib/types';

const TABS = ['Account', 'AI defaults', 'Usage', 'Data'] as const;
type Tab = (typeof TABS)[number];

export default function Settings() {
  const [tab, setTab] = useState<Tab>('Account');
  const { session } = useSession();
  const { data: profile } = useProfile();
  const { data: modelsData } = useModels();
  const { theme, setTheme } = useThemeStore();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [name, setName] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [defaultModel, setDefaultModel] = useState<string | null>(null);
  const [temperature, setTemperature] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  const prefs = profile?.preferences ?? {};
  const displayName = name ?? profile?.display_name ?? '';
  const curDefaultModel = defaultModel ?? prefs.default_model ?? modelsData?.default_model ?? '';
  const curTemp = temperature ?? prefs.temperature ?? 0.7;

  const { data: usage } = useQuery({
    queryKey: ['usage-by-model'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_usage');
      if (error) throw error;
      return data as UsageRow[];
    },
  });

  const { data: totals } = useQuery({
    queryKey: ['usage-totals'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_usage_totals');
      if (error) throw error;
      return data as any;
    },
  });

  const saveProfile = async () => {
    await supabase
      .from('profiles')
      .update({
        display_name: displayName,
        preferences: { ...prefs, default_model: curDefaultModel, temperature: curTemp },
      })
      .eq('id', session!.user.id);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    qc.invalidateQueries({ queryKey: ['profile'] });
  };

  const exportData = async () => {
    setExporting(true);
    try {
      const [convRes, msgRes] = await Promise.all([
        supabase.from('conversations').select('*').order('updated_at', { ascending: false }),
        supabase.from('messages').select('*').order('created_at', { ascending: true }),
      ]);
      const payload = {
        exported_at: new Date().toISOString(),
        profile: { email: session?.user?.email, display_name: displayName },
        conversations: convRes.data ?? [],
        messages: msgRes.data ?? [],
      };
      downloadFile('synapse-export.json', JSON.stringify(payload, null, 2));
    } finally {
      setExporting(false);
    }
  };

  const deleteAccount = async () => {
    if (!confirm('Delete your account? All chats, projects, and data will be permanently removed. This cannot be undone.')) return;
    // Full account deletion must be performed via Supabase dashboard (auth.users cascade).
    alert(
      'For safety, account deletion is performed from the Supabase dashboard: Authentication → Users → delete your user. ' +
      'All data (chats, projects, files) is removed automatically by cascade.'
    );
  };

  return (
    <div className="mx-auto max-w-2xl p-6 sm:p-10">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Settings</h1>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-surface-200 dark:border-surface-800">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
              tab === t
                ? 'border-accent-500 font-medium text-accent-600 dark:text-accent-400'
                : 'border-transparent text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
            }`}
          >
            {t}
          </button>
        ))}
        {profile?.role === 'admin' && (
          <button onClick={() => navigate('/admin')} className="ml-auto -mb-px whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm text-surface-500 hover:text-accent-600">
            Admin →
          </button>
        )}
      </div>

      {tab === 'Account' && (
        <div className="space-y-6">
          <div>
            <label className="mb-1 block text-sm font-medium">Display name</label>
            <input className="input" value={displayName} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Email</label>
            <input className="input opacity-60" value={session?.user?.email ?? ''} disabled />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Theme</label>
            <div className="flex gap-2">
              {(['light', 'dark'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`btn-outline capitalize ${theme === t ? 'border-accent-500 text-accent-600 dark:text-accent-400' : ''}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <button onClick={saveProfile} className="btn-primary">{saved ? '✓ Saved' : 'Save changes'}</button>
        </div>
      )}

      {tab === 'AI defaults' && (
        <div className="space-y-6">
          <div>
            <label className="mb-1 block text-sm font-medium">Default model</label>
            <select
              className="input"
              value={curDefaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
            >
              {(modelsData?.curated ?? []).map((id) => {
                const m = modelsData?.models.find((x) => x.id === id);
                return (
                  <option key={id} value={id}>
                    {m?.name ?? id}
                  </option>
                );
              })}
              {modelsData?.models
                .filter((m) => !(modelsData.curated ?? []).includes(m.id))
                .slice(0, 200)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>
            <p className="mt-1 text-xs text-surface-400">
              Used for new conversations. You can switch models mid-chat anytime.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Temperature — {curTemp.toFixed(1)}</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={curTemp}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full accent-[#3375ff]"
            />
            <div className="flex justify-between text-xs text-surface-400">
              <span>Precise</span>
              <span>Balanced</span>
              <span>Creative</span>
            </div>
          </div>
          <button onClick={saveProfile} className="btn-primary">{saved ? '✓ Saved' : 'Save defaults'}</button>
          <p className="text-xs text-surface-400">
            Bring-your-own-key, memory controls, and research preferences arrive in later phases.
          </p>
        </div>
      )}

      {tab === 'Usage' && (
        <div className="space-y-4">
          {totals && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MiniStat label="Requests" value={String(totals.total_requests)} />
              <MiniStat label="Tokens in" value={formatTokens(totals.total_tokens_in)} />
              <MiniStat label="Tokens out" value={formatTokens(totals.total_tokens_out)} />
              <MiniStat label="Est. spend" value={formatCost(totals.total_cost)} />
            </div>
          )}
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 text-left text-xs uppercase tracking-wider text-surface-400 dark:border-surface-800">
                  <th className="px-4 py-2.5 font-medium">Model</th>
                  <th className="px-4 py-2.5 font-medium">Requests</th>
                  <th className="px-4 py-2.5 font-medium">Tokens</th>
                  <th className="px-4 py-2.5 font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {(usage ?? []).map((u) => (
                  <tr key={u.model} className="border-b border-surface-100 last:border-0 dark:border-surface-800/60">
                    <td className="px-4 py-2.5 font-mono text-xs">{u.model}</td>
                    <td className="px-4 py-2.5 tabular-nums">{u.requests}</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatTokens(u.tokens_in)} / {formatTokens(u.tokens_out)}</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatCost(u.cost_usd)}</td>
                  </tr>
                ))}
                {(usage ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-surface-400">No usage yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'Data' && (
        <div className="space-y-6">
          <div className="card p-5">
            <h3 className="font-medium">Export your data</h3>
            <p className="mt-1 text-sm text-surface-500">Download all conversations and messages as JSON.</p>
            <button onClick={exportData} disabled={exporting} className="btn-outline mt-3">
              {exporting ? 'Preparing…' : '⤓ Export all data'}
            </button>
          </div>
          <div className="card border-red-300/50 p-5 dark:border-red-500/30">
            <h3 className="font-medium text-red-600 dark:text-red-400">Danger zone</h3>
            <p className="mt-1 text-sm text-surface-500">Permanently delete your account and all associated data.</p>
            <button onClick={deleteAccount} className="btn mt-3 border border-red-400 text-red-600 hover:bg-red-500/10 dark:text-red-400">
              Delete account
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-surface-400">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
