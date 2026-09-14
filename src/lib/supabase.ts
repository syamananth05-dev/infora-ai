import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Set them in .env (local) or Netlify env Ù…ÉÌ¸œ(€€¤ì)ô()•áÁ½ÉÐ½¹ÍÐÍÕÁ…‰…Í”€ôÉ•…Ñ•±¥•¹Ð¡ÕÉ°°…¹½¹-•ä°ì(€…ÕÑ èì(€€€™±½ÝQåÁ”è€Á­”œ°(€€€Á•ÉÍ¥ÍÑM•ÍÍ¥½¸èÑÉÕ”°(€€€…ÕÑ½I•™É•Í¡Q½­•¸èÑÉÕ”°(€€€‘•Ñ•ÑM•ÍÍ¥½¹%¹UÉ°èÑÉÕ”°(€ô°)ô¤ì()•áÁ½ÉÐ…Íå¹Œ™Õ¹Ñ¥½¸•Ñ•ÍÍQ½­•¸ ¤èAÉ½µ¥Í”ñÍÑÉ¥¹œð¹Õ±°øì(€½¹ÍÐì‘…Ñ„ô€ô…Ý…¥ÐÍÕÁ…‰…Í”¹…ÕÑ ¹•ÑM•ÍÍ¥½¸ ¤ì(€É•ÑÕÉ¸‘…Ñ„¹Í•ÍÍ¥½¸ü¹…•ÍÍ}Ñ½­•¸€üü¹Õ±°ì)ô(