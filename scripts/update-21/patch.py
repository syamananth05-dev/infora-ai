import sys

root = sys.argv[1] if len(sys.argv) > 1 else '.'

# ================= src/routes/Chat.tsx =================
p = f'{root}/src/routes/Chat.tsx'
s = open(p).read()

# A1: reprompt rotation pool - deepseek/deepseek-v3.1 is no longer a valid model ID (400)
a = "const REPROMPT_MODELS = ['deepseek/deepseek-v3.1', 'openai/gpt-5.6-luna', 'google/gemma-3-27b-it'];"
n = "const REPROMPT_MODELS = ['deepseek/deepseek-v4-flash-0731', 'openai/gpt-5.6-luna', 'google/gemma-3-27b-it'];"
assert s.count(a) == 1, 'chat-anchor1'
s = s.replace(a, n, 1)

# A2: the Free chip's model slug - the old free slug was retired by OpenRouter
a = "setModel(v === 'best' ? '' : v === 'free' ? 'deepseek/deepseek-v4-flash-0731:free' : v);"
n = "setModel(v === 'best' ? '' : v === 'free' ? 'nvidia/nemotron-3-super-120b-a12b:free' : v);"
assert s.count(a) == 1, 'chat-anchor2'
s = s.replace(a, n, 1)
open(p, 'w').write(s)
print('Chat.tsx patched OK')

# ================= src/components/chat/ModelPicker.tsx =================
p = f'{root}/src/components/chat/ModelPicker.tsx'
s = open(p).read()

# B1: PREMIUM list - retire dead slugs (deepseek/deepseek-v3.1 invalid ID; anthropic/claude-3.5-haiku-20241022 404)
a = """const PREMIUM = [
  { id: 'deepseek/deepseek-v3.1', label: 'DeepSeek V3.1', note: 'Deepest thinking \u2014 code, analysis, reports' },
  { id: 'openai/gpt-5.6-luna', label: 'GPT-5.6 Luna', note: 'Balanced flagship' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini', note: 'Fast everyday workhorse' },
  { id: 'anthropic/claude-3.5-haiku-20241022', label: 'Claude Haiku', note: 'Sharp writing & summaries' },
];"""
n = """const PREMIUM = [
  { id: 'deepseek/deepseek-v4-flash-0731', label: 'DeepSeek V4 Flash', note: 'Deepest thinking \u2014 code, analysis, reports' },
  { id: 'openai/gpt-5.6-luna', label: 'GPT-5.6 Luna', note: 'Balanced flagship' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini', note: 'Fast everyday workhorse' },
];"""
assert s.count(a) == 1, 'picker-anchor1'
s = s.replace(a, n, 1)

# B2: verified free models + allowlist for the founder search
a = """const FAST = [
  { id: 'google/gemma-3-27b-it', label: 'Gemma 3 27B', note: 'Fast & light' },
  { id: 'mistralai/mistral-nemo', label: 'Mistral Nemo', note: 'Fast & light' },
];"""
n = a + """

// Update 21: live-verified free models (the old free slugs were retired by OpenRouter)
const FREE_VERIFIED = [
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', label: 'Nemotron 3 Super', note: 'Smart free all-rounder' },
  { id: 'nex-agi/nex-n2.5-pro:free', label: 'NEX N2.5 Pro', note: 'Strong free reasoning' },
  { id: 'inclusionai/ling-3.0-flash-vl:free', label: 'Ling 3.0 Flash VL', note: 'Free, image-capable' },
  { id: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31B', note: 'Free everyday model' },
];

// Update 21: the founder search only offers verified models. Dead or app-gated OpenRouter
// slugs (e.g. thinkingmachines/inkling-small:free) must never be selectable again.
const VERIFIED_IDS = [...PREMIUM, ...FAST, ...FREE_VERIFIED];"""
assert s.count(a) == 1, 'picker-anchor2'
s = s.replace(a, n, 1)

# B3: search over the verified allowlist instead of every OpenRouter model
a = """  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !founder) return [];
    return models
      .filter((m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
      .slice(0, 40);
  }, [models, query, founder]);"""
n = """  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !founder) return [];
    return VERIFIED_IDS.filter((m) => m.label.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
      .map((m) => ({ id: m.id, name: m.label, input_price_per_1m: models.find((x) => x.id === m.id)?.input_price_per_1m }));
  }, [models, query, founder]);"""
assert s.count(a) == 1, 'picker-anchor3'
s = s.replace(a, n, 1)

# B4: show the verified free models as their own group in the founder picker
a = """                  <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-surface-400">Fast & light</p>"""
n = """                  <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-surface-400">Free (verified)</p>
                  {FREE_VERIFIED.map((m) => (
                    <PickerRow key={m.id} active={value === m.id} onClick={() => pick(m.id)} label={m.label} note={m.note} />
                  ))}
                  <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-surface-400">Fast & light</p>"""
assert s.count(a) == 1, 'picker-anchor4'
s = s.replace(a, n, 1)

open(p, 'w').write(s)
print('ModelPicker.tsx patched OK')
