// OpenRouter gateway client. The OPENROUTER_API_KEY lives only in this
// server-side process (Netlify env var). It is never returned to the client.

const BASE = 'https://openrouter.ai/api/v1';
const API_KEY = process.env.OPENROUTER_API_KEY;
const APP_URL = process.env.APP_URL || process.env.URL || '';
const APP_TITLE = 'Synapse';

const headers = () => ({
  Authorization: `Bearer ${API_KEY}`,
  'Content-Type': 'application/json',
  ...(APP_URL ? { 'HTTP-Referer': APP_URL } : {}),
  'X-Title': APP_TITLE,
});

export interface ORModel {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  modality?: string;
  pricing?: { prompt?: string; completion?: string };
  supported_parameters?: string[];
  architecture?: { modality?: string; input_modalities?: string[] };
}

export interface PublicModel {
  id: string;
  name: string;
  description: string;
  context_length: number;
  modalities: string[];
  input_price_per_1m: number | null;
  output_price_per_1m: number | null;
  reasoning: boolean;
  vision: boolean;
}

let cache: { ts: number; models: PublicModel[] } | null = null;
const CACHE_TTL = 10 * 60 * 1000;

export async function listModels(): Promise<PublicModel[]> {
  if (cache && Date.now() - cache.ts < CACHE_TTL) return cache.models;
  if (!API_KEY) throw new Error('OPENROUTER_API_KEY not configured');
  const res = await fetch(`${BASE}/models`, { headers: headers() });
  if (!res.ok) throw new Error(`OpenRouter models error ${res.status}`);
  const json = (await res.json()) as { data?: ORModel[] };
  const all: PublicModel[] = (json.data ?? [])
    .map((m: ORModel) => mapModel(m))
    .filter((m: PublicModel) => m.modalities.includes('text') || m.vision);
  cache = { ts: Date.now(), models: all };
  return all;
}

function mapModel(m: ORModel): PublicModel {
  const inMods = m.architecture?.input_modalities ?? [];
  const mods = (m.architecture?.modality ?? m.modality ?? '')
    .split('->')
    .flatMap((s) => s.split('+'))
    .map((s) => s.trim().toLowerCase());
  const vision = inMods.includes('image') || mods.includes('image') || mods.includes('text+image->text');
  const reasoning = (m.supported_parameters ?? []).includes('reasoning');
  const pp = m.pricing?.prompt ? parseFloat(m.pricing.prompt) * 1_000_000 : null;
  const cp = m.pricing?.completion ? parseFloat(m.pricing.completion) * 1_000_000 : null;
  return {
    id: m.id,
    name: m.name || m.id,
    description: (m.description ?? '').slice(0, 280),
    context_length: m.context_length ?? 0,
    modalities: mods.length ? mods : ['text'],
    input_price_per_1m: pp,
    output_price_per_1m: cp,
    reasoning,
    vision,
  };
}

export const CURATED_DEFAULTS = [
  'openai/gpt-4o-mini',
  'openai/gpt-4o',
  'anthropic/claude-3.5-sonnet',
  'anthropic/claude-3.5-haiku',
  'google/gemini-flash-1.5',
  'google/gemini-pro-1.5',
  'meta-llama/llama-3.1-70b-instruct',
  'deepseek/deepseek-chat',
];

export function getDefaultModel(): string {
  return process.env.OPENROUTER_DEFAULT_MODEL || 'openai/gpt-4o-mini';
}

export function chatCompletions(payload: {
  model: string;
  messages: any[];
  temperature?: number;
  max_tokens?: number;
}): Promise<Response> {
  return fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      model: payload.model,
      messages: payload.messages,
      stream: true,
      stream_options: { include_usage: true },
      ...(payload.temperature !== undefined ? { temperature: payload.temperature } : {}),
      ...(payload.max_tokens ? { max_tokens: payload.max_tokens } : {}),
    }),
  });
}
