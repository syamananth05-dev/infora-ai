import { requireUser, errorJson, json } from './_lib/supabase';
import { listModels, CURATED_DEFAULTS, getDefaultModel } from './_lib/openrouter';

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'GET') return errorJson('Method not allowed', 405);
  const user = await requireUser(req.headers.get('authorization'));
  if (!user) return errorJson('Unauthorized', 401);

  try {
    const models = await listModels();
    const curatedIds = process.env.OPENROUTER_CURATED?.split(',').map((s) => s.trim()) ?? CURATED_DEFAULTS;
    return json({
      models,
      curated: curatedIds.filter((id) => models.some((m) => m.id === id)),
      default_model: getDefaultModel(),
    });
  } catch (err: any) {
    return errorJson(err?.message || 'Failed to load models', 502);
  }
};
