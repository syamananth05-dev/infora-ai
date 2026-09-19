import { getAccessToken, EDGE_FUNCTION_BASE } from './supabase';

export interface ToolEvent {
  name: string;
  args: Record<string, unknown>;
  phase: 'start' | 'done';
  summary?: string;
}

export interface ChatStreamHandlers {
  onMeta?: (meta: { conversation_id: string; message_id: string; model: string }) => void;
  onDelta?: (text: string) => void;
  onTool?: (tool: ToolEvent) => void;
  onDone?: (info: {
    usage: { tokens_in: number; tokens_out: number; cost_usd: number; latency_ms: number };
    message_id?: string;
  }) => void;
  onError?: (message: string) => void;
}

export interface ChatStreamPayload {
  conversation_id?: string;
  project_id?: string | null;
  parent_message_id?: string | null;
  model?: string;
  level?: 1 | 2 | 3;
  mode?: 'chat' | 'agent';
  content: string;
  temperature?: number;
  attachments?: { name: string; mime: string; size: number; path?: string }[];
  images?: string[];
}

export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not signed in');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export async function streamChat(
  payload: ChatStreamPayload,
  handlers: ChatStreamHandlers
): Promise<void> {
  const headers = await authHeaders();
  const endpoint = payload.mode === 'agent' ? 'agent' : 'chat';
  const res = await fetch(`${EDGE_FUNCTION_BASE}/${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      message = j.message || j.error || message;
      if (res.status === 429) message = 'You are sending messages too quickly. Please wait a moment.';
    } catch {}
    handlers.onError?.(message);
    return;
  }
  if (!res.body) {
    handlers.onError?.('No response stream');
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const handleEvent = (event: string, dataStr: string) => {
    try {
      const data = JSON.parse(dataStr);
      switch (event) {
        case 'meta':
          handlers.onMeta?.(data);
          break;
        case 'delta':
          handlers.onDelta?.(data.text);
          break;
        case 'tool':
          handlers.onTool?.(data);
          break;
        case 'done':
          handlers.onDone?.(data);
          break;
        case 'error':
          handlers.onError?.(data.message || 'Stream error');
          break;
      }
    } catch {}
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const lines = block.split('\n');
      let event = 'message';
      const dataLines: string[] = [];
      for (const line of lines) {
        if (line.startsWith('event: ')) event = line.slice(7).trim();
        else if (line.startsWith('data: ')) dataLines.push(line.slice(6));
      }
      if (dataLines.length) handleEvent(event, dataLines.join('\n'));
    }
  }
}

export async function fetchModels(): Promise<{
  models: import('./types').ModelInfo[];
  curated: string[];
  default_model: string;
}> {
  const headers = await authHeaders();
  const res = await fetch(`${EDGE_FUNCTION_BASE}/models`, { headers });
  if (!res.ok) throw new Error(`Failed to load models (${res.status})`);
  return res.json();
}

export function downloadFile(filename: string, content: string, mime = 'application/json') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function compressConversation(conversationId: string, model: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${EDGE_FUNCTION_BASE}/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'compress', conversation_id: conversationId, model }),
  });
  if (!res.ok) {
    let message = `Compress failed (${res.status})`;
    try {
      const j = await res.json();
      message = j.message || j.error || message;
    } catch {}
    throw new Error(message);
  }
}
