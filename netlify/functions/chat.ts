import { requireUser, supabaseAdmin, json, errorJson, checkRateLimit } from './_lib/supabase';
import { chatCompletions, getDefaultModel, listModels } from './_lib/openrouter';

interface ORMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | any[];
}

interface Attachment {
  name: string;
  mime: string;
  size: number;
  path?: string;
}

interface ChatRequest {
  conversation_id?: string;
  project_id?: string;
  parent_message_id?: string | null;
  model?: string;
  content: string;
  temperature?: number;
  attachments?: Attachment[];
  images?: string[];
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return errorJson('Method not allowed', 405);

  const user = await requireUser(req.headers.get('authorization'));
  if (!user) return errorJson('Unauthorized', 401);

  const allowed = await checkRateLimit(user.id, 30, 60);
  if (!allowed) {
    return json({ error: 'rate_limited', message: 'Too many requests. Please slow down.' }, 429);
  }

  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return errorJson('Invalid JSON body', 400);
  }

  const content = (body.content || '').trim();
  if (!content) return errorJson('Message content is required', 400);
  if (content.length > 120_000) return errorJson('Message too long', 413);
  if (body.images && body.images.length > 4) return errorJson('Too many images (max 4)', 400);

  const model = body.model || getDefaultModel();
  const startedAt = Date.now();

  let conversationId = body.conversation_id;
  if (!conversationId) {
    const title = content.slice(0, 60) + (content.length > 60 ? '…' : '');
    const { data: conv, error } = await supabaseAdmin
      .from('conversations')
      .insert({ user_id: user.id, project_id: body.project_id || null, title, model_hint: model })
      .select('id')
      .single();
    if (error || !conv) return errorJson('Failed to create conversation', 500);
    conversationId = conv.id;
  } else {
    const { data: conv } = await supabaseAdmin
      .from('conversations').select('id, user_id').eq('id', conversationId).single();
    if (!conv || conv.user_id !== user.id) return errorJson('Conversation not found', 404);
  }

  let projectInstructions: string | null = null;
  if (body.project_id) {
    const { data: proj } = await supabaseAdmin
      .from('projects').select('instructions, user_id').eq('id', body.project_id).single();
    if (proj && proj.user_id === user.id) projectInstructions = proj.instructions;
  }

  const attachments = body.attachments ?? [];
  const { data: userMsg, error: msgErr } = await supabaseAdmin
    .from('messages')
    .insert({ conversation_id: conversationId, user_id: user.id, parent_message_id: body.parent_message_id || null, role: 'user', content, attachments })
    .select('id, parent_message_id')
    .single();
  if (msgErr || !userMsg) return errorJson('Failed to save message', 500);

  const history: any[] = [];
  let cursor: string | null = userMsg.parent_message_id;
  let guard = 0;
  while (cursor && guard < 30) {
    guard++;
    const { data: m } = await supabaseAdmin
      .from('messages').select('id, parent_message_id, role, content').eq('id', cursor).single();
    if (!m) break;
    history.unshift(m);
    cursor = m.parent_message_id;
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles').select('preferences').eq('id', user.id).single();
  const prefs = (profile?.preferences ?? {}) as { response_style?: string; temperature?: number };
  const styleHint = prefs.response_style ? ` Respond in a ${prefs.response_style} tone.` : '';

  const systemPrompt = [
    'You are Synapse, a helpful, precise, and thoughtful AI assistant.',
    'Use Markdown formatting. When citing sources, include the URL.',
    projectInstructions ? `\nProject context:\n${projectInstructions}` : '',
    styleHint,
  ].join('\n');

  const messages: ORMessage[] = [{ role: 'system', content: systemPrompt }];
  for (const m of history) {
    if (m.role === 'system') continue;
    messages.push({ role: m.role, content: m.content });
  }

  const images = body.images ?? [];
  if (images.length) {
    const parts: any[] = [{ type: 'text', text: content }];
    for (const url of images) parts.push({ type: 'image_url', image_url: { url } });
    messages.push({ role: 'user', content: parts });
  } else {
    messages.push({ role: 'user', content });
  }

  const upstream = await chatCompletions({ model, messages, temperature: body.temperature ?? prefs.temperature });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '');
    let message = `The model is currently unavailable (HTTP ${upstream.status}).`;
    try { const j = JSON.parse(detail); message = j?.error?.message || message; } catch {}
    return json({ error: 'upstream_error', message }, 502);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(sse('meta', { conversation_id: conversationId, message_id: userMsg.id, model })));
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantText = '';
      let usage: any = null;
      let finalized = false;

      const finalize = async (status: 'ok' | 'error') => {
        if (finalized) return;
        finalized = true;
        const latency = Date.now() - startedAt;
        const tokensIn = usage?.prompt_tokens ?? 0;
        const tokensOut = usage?.completion_tokens ?? Math.ceil(assistantText.length / 4);
        let cost = 0;
        try {
          const models = await listModels();
          const m = models.find((x) => x.id === model);
          if (m) {
            cost = (tokensIn / 1_000_000) * (m.input_price_per_1m ?? 0) +
                   (tokensOut / 1_000_000) * (m.output_price_per_1m ?? 0);
          }
        } catch {}
        const { data: aMsg } = await supabaseAdmin
          .from('messages')
          .insert({ conversation_id: conversationId!, user_id: user.id, parent_message_id: userMsg.id, role: 'assistant', content: assistantText, model, tokens_in: tokensIn, tokens_out: tokensOut, cost_usd: cost })
          .select('id').single();
        await supabaseAdmin.from('api_usage').insert({ user_id: user.id, conversation_id: conversationId, model, tokens_in: tokensIn, tokens_out: tokensOut, cost_usd: cost, latency_ms: latency, status });
        await supabaseAdmin.from('conversations').update({ updated_at: new Date().toISOString(), model_hint: model }).eq('id', conversationId);
        controller.enqueue(encoder.encode(sse('done', { usage: { tokens_in: tokensIn, tokens_out: tokensOut, cost_usd: cost, latency_ms: latency }, message_id: aMsg?.id })));
        controller.close();
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n');
          buffer = parts.pop() || '';
          for (const line of parts) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const dataStr = trimmed.slice(5).trim();
            if (dataStr === '[DONE]') { await finalize('ok'); return; }
            try {
              const json = JSON.parse(dataStr);
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) { assistantText += delta; controller.enqueue(encoder.encode(sse('delta', { text: delta }))); }
              if (json.usage) usage = json.usage;
            } catch {}
          }
        }
        await finalize('ok');
      } catch (err: any) {
        controller.enqueue(encoder.encode(sse('error', { message: err?.message || 'Stream interrupted' })));
        await finalize('error');
      }
    },
  });

  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', 'x-accel-buffering': 'no' },
  });
};
