export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: 'user' | 'admin';
  preferences: {
    default_model?: string;
    temperature?: number;
    response_style?: string;
  };
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  color: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  project_id: string | null;
  title: string;
  mode: string;
  model_hint: string | null;
  summary?: string | null;
  pinned: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Attachment {
  name: string;
  mime: string;
  size: number;
  path?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  user_id: string;
  parent_message_id: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments: Attachment[];
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: number | null;
  created_at: string;
  compressed?: boolean;
}

export interface ModelInfo {
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

export interface ModelsResponse {
  models: ModelInfo[];
  curated: string[];
  default_model: string;
}

export interface UsageRow {
  model: string;
  requests: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  first_used: string;
  last_used: string;
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function formatCost(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

export function formatContext(n: number): string {
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

export function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}
