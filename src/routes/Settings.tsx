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
  defaults?: Record<string, string>;
}

const PRESETS: ConnectorPreset[] = [
  { name: 'Notion', type: 'notion', icon: '📓', blurb: 'Search and update your team Notion workspace.', fields: [{ key: 'token', label: 'Integration token', placeholder: 'secret_…' }], help: 'Notion → your workspace → Settings → Connections → copy the internal integration token. Then share the pages you want Infora to see with that integration.' },
  { name: 'Google Workspace', type: 'google', icon: '✉️', blurb: 'Gmail, Calendar, Drive and Sheets.', fields: [{ key: 'access_token', label: 'Google access token', placeholder: 'ya29.…' }], help: 'Paste a Google OAuth access token. Full one-click Google sign-in arrives in the next update.' },
  { name: 'Slack', type: 'slack', icon: '💬', blurb: 'Post messages to a Slack channel from chat.', fields: [{ key: 'webhook_url', label: 'Incoming webhook URL', placeholder: 'https://hooks.slack.com/…' }], help: 'Slack → channel → Integrations → Incoming Webhooks → create one for the channel.' },
  { name: 'Telegram', type: 'telegram', icon: '✈️', blurb: 'Send Telegram messages via your bot.', fields: [{ key: 'bot_token', label: 'Bot token', placeholder: '123456:ABC…' }, { key: 'chat_id', label: 'Chat ID', placeholder: 'e.g. 98765432' }], help: 'Message @BotFather on Telegram → /newbot → copy the token. Chat ID: message @userinfobot to get yours.' },
  { name: 'Zoho', type: 'zoho', icon: '🏢', blurb: 'Query your Zoho CRM / Books data.', fields: [{ key: 'token', label: 'OAuth token', placeholder: '1000.xxxx…' }, { key: 'base_url', label: 'API base URL (optional)', placeholder: 'https://www.zohoapis.com', optional: true }], help: 'Zoho API Console → generate an OAuth token with the scopes you need (e.g. ZohoCRM.modules.READ).' },
  { name: 'GitHub', type: 'api', icon: '🐙', blurb: 'Read repos, issues and PRs; create issues from chat.', defaults: { base_url: 'https://api.github.com', auth_style: 'bearer' }, fields: [{ key: 'token', label: 'Personal access token', placeholder: 'ghp_… or github_pat_…' }], help: 'GitHub → Settings → Developer settings → Personal access tokens → Generate new token (fine-grained recommended, only the repos it needs).' },
  { name: 'Jira', type: 'api', icon: '🧭', blurb: 'Search and manage Jira issues.', defaults: { auth_style: 'basic' }, fields: [{ key: 'base_url', label: 'Your site URL', placeholder: 'https://yoursite.atlassian.net' }, { key: 'username', label: 'Your Atlassian email', placeholder: 'you@team.com' }, { key: 'token', label: 'API token', placeholder: 'ATATT…' }], help: 'id.atlassian.com → Security → Create API token.' },
  { name: 'Linear', type: 'api', icon: '📐', blurb: 'Query and manage Linear issues (GraphQL).', defaults: { base_url: 'https://api.linear.app/graphql', auth_style: 'bearer' }, fields: [{ key: 'token', label: 'API key', placeholder: 'lin_api_…' }], help: 'Linear → Settings → Security & access → Personal API keys.' },
  { name: 'Airtable', type: 'api', icon: '🗂️', blurb: 'Read and update Airtable bases.', defaults: { base_url: 'https://api.airtable.com/v0', auth_style: 'bearer' }, fields: [{ key: 'token', label: 'Personal access token', placeholder: 'pat…' }], help: 'airtable.com → Account → Developer hub → Personal access tokens.' },
  { name: 'ClickUp', type: 'api', icon: '☑️', blurb: 'Manage ClickUp tasks and lists.', defaults: { base_url: 'https://api.clickup.com/api/v2', auth_style: 'plain' }, fields: [{ key: 'token', label: 'Personal API token', placeholder: 'pk_…' }], help: 'ClickUp → Settings → Apps → API token.' },
  { name: 'Asana', type: 'api', icon: '✅', blurb: 'Read and update Asana tasks and projects.', defaults: { base_url: 'https://app.asana.com/api/1.0', auth_style: 'bearer' }, fields: [{ key: 'token', label: 'Personal access token', placeholder: '1/1234:abc…' }], help: 'asana.com → Developer console → Personal access token.' },
  { name: 'Trello', type: 'api', icon: '📋', blurb: 'Read boards, cards and lists.', defaults: { base_url: 'https://api.trello.com/1', auth_style: 'query:token' }, fields: [{ key: 'key', label: 'API key', placeholder: 'from trello.com/power-ups/admin' }, { key: 'token', label: 'API token', placeholder: 'generated with the key' }], help: 'trello.com → Power-Ups admin → create a Power-Up (or use the API key page) → copy key, then generate a token with it.' },
  { name: 'Stripe', type: 'api', icon: '💳', blurb: 'Check payments, customers and subscriptions.', defaults: { base_url: 'https://api.stripe.com/v1', auth_style: 'bearer' }, fields: [{ key: 'token', label: 'Secret key (test or live)', placeholder: 'sk_test_… / sk_live_…' }], help: 'stripe.com → Developers → API keys → Secret key. Use sk_test_ for safe testing.' },
  { name: 'HubSpot', type: 'api', icon: '🧲', blurb: 'Query HubSpot contacts, deals and tickets.', defaults: { base_url: 'https://api.hubapi.com', auth_style: 'bearer' }, fields: [{ key: 'token', label: 'Private app token', placeholder: 'pat-eu1-…' }], help: 'HubSpot → Settings → Integrations → Private Apps → create one with the scopes you need.' },
  { name: 'n8n', type: 'n8n', icon: '⚙️', blurb: 'Trigger your n8n workflows (500+ integrations) from chat.', fields: [{ key: 'webhook_url', label: 'Webhook URL', placeholder: 'https://…/webhook/…' }], help: 'n8n → open your workflow → Webhook node → copy the Production URL.' },
  { name: 'MCP Server', type: 'mcp', icon: '🧩', blurb: 'Connect ANY MCP server — the same universal standard Claude uses. Infora auto-discovers its tools.', fields: [{ key: 'url', label: 'MCP server URL', placeholder: 'https://example.com/mcp' }, { key: 'token', label: 'Bearer token (optional)', placeholder: 'optional', optional: true }], help: 'Paste the URL of any MCP server (Streamable HTTP). Its tools become usable in Agent mode automatically.' },
  { name: 'Custom API', type: 'custom', icon: '🔌', blurb: 'Connect any REST API or webhook.', fields: [{ key: 'base_url', label: 'Base URL', placeholder: 'https://api.example.com' }, { key: 'token', label: 'API key / token (optional)', placeholder: 'your key', optional: true }, { key: 'token_name', label: 'Header name for the key (optional)', placeholder: 'X-API-Key', optional: true }], help: 'Works with almost any service that has an API. The agent handles the auth header automatically.' },
];

const HELP_STEPS: Record<string, { steps: string[]; link?: string }> = {
  'Notion': {
    steps: [
      'Go to notion.so/my-integrations and click New integration.',
      'Name it Infora, select your workspace, and submit.',
      'Copy the Internal Integration Secret (starts with secret_).',
      'In Notion, open each page you want Infora to see, tap the ... menu, then Connections, and add the Infora integration.',
      'Paste the secret here and save.',
    ],
    link: 'https://www.notion.so/my-integrations',
  },
  'Google Workspace': {
    steps: [
      'One-click Google sign-in is arriving in the next update.',
      'For now, paste a Google OAuth access token (starts with ya29.) if you have one.',
      'Full Gmail, Calendar, Drive and Sheets access will be one click once released.',
    ],
  },
  'Slack': {
    steps: [
      'Go to api.slack.com/apps and click Create New App, then From scratch.',
      'Name it Infora and pick your workspace.',
      'In the left menu open Incoming Webhooks, toggle it ON, then Add New Webhook to Workspace and pick the channel.',
      'Copy the Webhook URL and paste it here.',
    ],
    link: 'https://api.slack.com/apps',
  },
  'Telegram': {
    steps: [
      'Open Telegram and message @BotFather.',
      'Send /newbot and follow the prompts, then copy the bot token (looks like 123456:ABC...).',
      'Open a chat with your new bot and press Start so it can message you.',
      'Message @userinfobot to get your numeric chat ID.',
      'Paste both the bot token and chat ID here.',
    ],
    link: 'https://t.me/BotFather',
  },
  'Zoho': {
    steps: [
      'Go to api-console.zoho.com and create a Self Client.',
      'Generate an OAuth token with the scopes you need (e.g. ZohoCRM.modules.READ).',
      'Paste the token here.',
    ],
    link: 'https://api-console.zoho.com',
  },
  'GitHub': {
    steps: [
      'Go to github.com/settings/tokens and generate a new token. Fine-grained is recommended.',
      'Select only the repositories it needs, with read access (add Issues write if Infora should file issues for you).',
      'Copy the token (starts with github_pat_ or ghp_) and paste it here.',
    ],
    link: 'https://github.com/settings/tokens',
  },
  'Jira': {
    steps: [
      'Go to id.atlassian.com, open Security, then API tokens, and create one.',
      'Paste your site URL (https://yoursite.atlassian.net), your Atlassian email, and the token here.',
    ],
    link: 'https://id.atlassian.com/manage-profile/security/api-tokens',
  },
  'Linear': {
    steps: [
      'Open Linear, go to Settings, then Security & access, then Personal API keys.',
      'Create a new key and copy it (starts with lin_api_).',
      'Paste it here.',
    ],
  },
  'Airtable': {
    steps: [
      'Go to airtable.com/create/tokens (Account, then Developer hub).',
      'Create a new token with the scopes you need (e.g. read records) and select which bases it can access.',
      'Copy the token (starts with pat) and paste it here.',
    ],
    link: 'https://airtable.com/create/tokens',
  },
  'ClickUp': {
    steps: [
      'Open ClickUp, tap your avatar, then Settings, then Apps.',
      'Create an API token and copy it (starts with pk_).',
      'Paste it here.',
    ],
  },
  'Asana': {
    steps: [
      'Open the Asana developer console (asana.com, Developer apps).',
      'Create a new personal access token.',
      'Copy it (looks like 1/1234:abc...) and paste it here.',
    ],
  },
  'Trello': {
    steps: [
      'Go to trello.com/power-ups/admin and log in.',
      'Create a new Power-Up (or find your API key on that page) and copy the key.',
      'Click Token next to the key, approve it, and copy the token.',
      'Paste both the key and token here.',
    ],
  },
  'Stripe': {
    steps: [
      'Use Test mode first: dashboard.stripe.com/testmode/developers/apikeys.',
      'Copy the Secret key (starts with sk_test_).',
      'Paste it here. Test keys are safe to experiment with.',
    ],
    link: 'https://dashboard.stripe.com/testmode/developers/apikeys',
  },
  'HubSpot': {
    steps: [
      'Open HubSpot Settings, then Integrations, then Private Apps.',
      'Create a private app with the scopes you need (e.g. CRM read).',
      'Copy the token (starts with pat-) and paste it here.',
    ],
  },
  'n8n': {
    steps: [
      'Open your workflow in n8n and add a Webhook node.',
      'Copy the Production URL.',
      'Paste it here. The agent can then trigger that workflow whenever you ask.',
    ],
  },
  'MCP Server': {
    steps: [
      'Get the URL of any MCP server (Streamable HTTP) you want to use.',
      'Optionally add its bearer token.',
      'Paste the URL here. Infora auto-discovers its tools in Agent mode.',
    ],
  },
  'Custom API': {
    steps: [
      'Find the API documentation of the service you want to connect.',
      'Paste its base URL (e.g. https://api.example.com).',
      'Add the API key and its header name if the service needs one.',
      'The agent handles the auth automatically from there.',
    ],
  },
};

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
  const [helpOpen, setHelpOpen] = useState(false);

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
    const config: Record<string, string> = { ...(preset.defaults || {}) };
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
              className="w-full accent-[#ff7a1a]"
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
            Connect an app once — then anyone on the team can use it from Agent mode by just asking. Also supports MCP servers (the same standard Claude uses) — paste a URL and Infora learns its tools. Keys are shared with the whole team.
          </p>
          <button
            onClick={() => setHelpOpen(true)}
            className="btn-outline inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
          >
            ❓ How to connect apps — step-by-step guide
          </button>
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

      {helpOpen && <ConnHelpModal onClose={() => setHelpOpen(false)} />}
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

function ConnHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="card max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">How to connect your apps</h3>
            <p className="text-xs text-surface-400">Three steps, once per app — then the whole team can use it in Agent mode.</p>
          </div>
          <button onClick={onClose} className="btn-ghost px-2 py-1 text-sm">✕</button>
        </div>
        <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm text-surface-600 dark:text-surface-300">
          <li>Click <span className="font-medium">Connect</span> on an app in the Connectors tab.</li>
          <li>Open that app and copy its key or token — exact steps for every app are below.</li>
          <li>Paste it back and hit <span className="font-medium">Save connection</span>. Done.</li>
        </ol>
        <p className="mb-4 text-xs text-surface-400">
          After saving, just ask Infora in Agent mode — e.g. search my Notion for the launch plan. Keys are shared with your whole team.
        </p>
        <div className="space-y-2">
          {PRESETS.map((p) => {
            const g = HELP_STEPS[p.name];
            if (!g) return null;
            return (
              <details key={p.name} className="group rounded-lg border border-surface-200 p-3 dark:border-surface-800">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium">
                  <span className="text-lg">{p.icon}</span>
                  {p.name}
                  <span className="ml-auto text-xs text-surface-400 transition-transform group-open:rotate-180">▼</span>
                </summary>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-surface-600 dark:text-surface-300">
                  {g.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
                {g.link && (
                  <a
                    href={g.link}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-xs font-medium text-accent-600 hover:underline dark:text-accent-400"
                  >
                    Open {p.name} →
                  </a>
                )}
              </details>
            );
          })}
        </div>
      </div>
    </div>
  );
}
