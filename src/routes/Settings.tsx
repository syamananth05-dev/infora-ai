import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSession, useProfile, useModels } from '../hooks/useSession';
import { useThemeStore } from '../lib/stores';
import { downloadFile } from '../lib/api';
import { formatCost, formatTokens } from '../lib/types';
import type { UsageRow } from '../lib/types';

const TABS = ['Account', 'AI defaults', 'Connectors', 'Usage', 'Data'] as const;

interface ConnectorPreset {
  name: string;
  type: string;
  icon: string;
  blurb: string;
  fields: { key: string; label: string; placeholder: string; optional?: boolean }[];
  help: string;
}

const PRESETS: ConnectorPreset[] = [
  { name: 'Notion', type: 'notion', icon: '📓', blurb: 'Search and update your team Notion workspace.', fields: [{ key: 'token', label: 'Integration token', placeholder: 'secret_…' }], help: 'Notion → your workspace → Settings → Connections → copy the internal integration token. Then share the pages you want Infora to see with that integration.' },
  { name: 'n8n', type: 'n8n', icon: '⚙️', blurb: 'Trigger your n8n workflows from chat.', fields: [{ key: 'webhook_url', label: 'Webhook URL', placeholder: 'https://…/webhook/…' }], help: 'n8n → open your workflow → Webhook node → copy the Production URL.' },
  { name: 'Slack', type: 'slack', icon: '💬', blurb: 'Post messages to a Slack channel from chat.', fields: [{ key: 'webhook_url', label: 'Incoming webhook URL', placeholder: 'https://hooks.slack.com/…' }], help: 'Slack → channel → Integrations → Incoming Webhooks → create one for the channel.' },
  { name: 'Telegram', type: 'telegram', icon: '✈️', blurb: 'Send Telegram messages via your bot.', fields: [{ key: 'bot_token', label: 'Bot token', placeholder: '123456:ABC…' }, { key: 'chat_id', label: 'Chat ID', placeholder: 'e.g. 98765432' }], help: 'Message @BotFather on Telegram → /newbot → copy the token. Chat ID: message @userinfobot to get yours.' },
  { name: 'Zoho', type: 'zoho', icon: '🏢', blurb: 'Query your Zoho CRM / Books data.', fields: [{ key: 'token', label: 'OAuth token', placeholder: '1000.xxxx…' }, { key: 'base_url', label: 'API base URL (optional)', placeholder: 'https://www.zohoapis.com', optional: true }], help: 'Zoho API Console → generate an OAuth token with the scopes you need (e.g. ZohoCRM.modules.READ).' },
  { name: 'Gmail', type: 'google', icon: '✉️', blurb: 'Read and send Gmail / Google Workspace mail.', fields: [{ key: 'access_token', label: 'Google access token', placeholder: 'ya29.…' }], help: 'Paste a Google OAuth access token. Full one-click Google sign-in arrives in the next update.' },
  { name: 'Custom API', type: 'custom', icon: '🔌', blurb: 'Connect any REST API or webhook.', fields: [{ key: 'base_url', label: 'Base URL', placeholder: 'https://api.example.com' }, { key: 'token', label: 'API key / token (optional)', placeholder: 'your key', optional: true }, { key: 'token_name', label: 'Header name for the key (optional)', placeholder: 'X-API-Key', optional: true }], help: 'Works with almost any service that has an API. The agent handles the auth header automatically.' },
];

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
  const [openConn, setOpenConn] = useState<string | null>(null);
  const [connVals, setConnVals] = useState<Record<string, string>>({});
  const [connMsg, setConnMsg] = useState('');

  const { data: connectors } = useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      const { data, error } = await supabase.from('integrations').select('name,type,updated_at');
      if (error) throw error;
      return data as { name: string; type: string; updated_at: string }[];
    },
  });
  const connectedNames = new Set((connectors ?? []).map((c) => c.name));

  const saveConnector = async (preset: ConnectorPreset) => {
    const config: Record<string, string> = {};
    for (const f of preset.fields) {
      const v = (connVals[`${preset.name}:${f.key}`] || '').trim();
      if (!v && !f.optional) { setConnMsg(`Please fill in: ${f.label}`); return; }
      if (v) config[f.key] = v;
    }
    const { error } = await supabase.from('integrations').upsert(
      { name: preset.name, type: preset.type, config, created_by: session!.user.id },
      { onConflict: 'name' }
    );
    if (error) { setConnMsg(`Could not save: ${error.message}`); return; }
    setConnMsg(`${preset.name} connected! Try it in Agent mode - just ask.`);
    setOpenConn(null);
    setConnVals({});
    qc.invalidateQueries({ queryKey: ['integrations'] });
  };

  const disconnectConnector = async (name: string) => {
    await supabase.from('integrations').delete().eq('name', name);
    qc.invalidateQueries({ queryKey: ['integrations'] });
  };

  const prefs = profile?.preferences ?? {};
  const displayName = name ?? profile?.display_name ?? '';
  const curDefaultModel = defaultModel ?? prefs.default_model ?? modelsData?.default_model ?? '';
  const curTemp = temperature ?? prefs.temperature ?? 0.7;

  const { data: usage } = useQuery({
    queryKey: ['usage-by-model'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_team_usage');
      if (error) throw error;
      return data as UsageRow[];
    },
  });

  const { data: totals } = useQuery({
    queryKey: ['usage-totals'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_team_usage_totals');
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
      downloadFile('infora-export.json', JSON.stringify(payload, null, 2));
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

      {tab === 'Connectors' && (
        <div className="space-y-4">
          <p className="text-sm text-surface-500">
            Connect an app once — then anyone on the team can use it from Agent mode by just asking. Keys are shared with the whole team.
          </p>
          {connMsg && <p className="card p-3 text-sm">{connMsg}</p>}
          {PRESETS.map((p) => (
            <div key={p.name} className="card p-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{p.icon}</span>
                <div className="flex-1">
                  <h3 className="font-medium">{p.name}</h3>
                  <p className="text-xs text-surface-400">{p.blurb}</p>
                </div>
                {connectedNames.has(p.name) ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">✓ Connected</span>
                    <button onClick={() => disconnectConnector(p.name)} className="btn-ghost px-2 py-1 text-xs" title="Disconnect">✕</button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setOpenConn(openConn === p.name ? null : p.name); setConnMsg(''); }}
                    className="btn-outline px-3 py-1.5 text-sm"
                  >
                    {openConn === p.name ? 'Close' : 'Connect'}
                  </button>
                )}
              </div>
              {openConn === p.name && (
                <div className="mt-3 space-y-3 border-t border-surface-100 pt-3 dark:border-surface-800">
                  {p.fields.map((f) => (
                    <div key={f.key}>
                      <label className="mb-1 block text-sm font-medium">
                        {f.label}
                        {!f.optional && <span className="text-red-500"> *</span>}
                      </label>
                      <input
                        className="input"
                        type={f.key.includes('token') || f.key === 'webhook_url' ? 'password' : 'text'}
                        placeholder={f.placeholder}
                        value={connVals[`${p.name}:${f.key}`] || ''}
                        onChange={(e) => setConnVals((prev) => ({ ...prev, [`${p.name}:${f.key}`]: e.target.value }))}
                      />
                    </div>
                  ))}
                  <p className="text-xs text-surface-400">{p.help}</p>
                  <button onClick={() => saveConnector(p)} className="btn-primary">Save connection</button>
                </div>
              )}
            </div>
          ))}
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
