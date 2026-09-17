#!/usr/bin/env python3
"""Patch Settings.tsx: add a help button + step-by-step connect guide modal in the Connectors tab."""
import sys

PATH = sys.argv[1]
src = open(PATH, encoding='utf-8').read()
orig = src

def must(old, new, count=1):
    global src
    n = src.count(old)
    assert n == count, f"anchor found {n}x (expected {count}): {old[:80]!r}"
    src = src.replace(old, new)

# 1. Add modal open state
must(
    "  const [connMsg, setConnMsg] = useState('');\n",
    "  const [connMsg, setConnMsg] = useState('');\n  const [helpOpen, setHelpOpen] = useState(false);\n",
)

# 2. Insert HELP_STEPS data before `type Tab`
help_steps = """
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
      'Name it Infora and pick your workspace',
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
  'AsanaiÎ€ì(€€€ÍÑ•ÁÌèl(€€€€€€=Á•¸Ñ¡”Í…¹„‘•Ù•±½Á•È½¹Í½±”€¡…Í…¹„¹½´°•Ù•±½Á•È…ÁÁÌ¤¸œ°(€€€€€€É•…Ñ”„¹•ÜÁ•ÉÍ½¹…°…•ÍÌÑ½­•¸¸œ°(€€€€€€½Áä¥Ğ€¡±½½­Ì±¥­”€Ä¼ÄÈÌĞé…‰Œ¸¸¸¤…¹Á…ÍÑ”¥Ğ¡•É”¸œ°(€€€t°(€ô°(€€QÉ•±±¼œèì(€€€ÍÑ•ÁÌèl(€€€€€€¼Ñ¼ÑÉ•±±¼¹½´½Á½İ•ÈµÕÁÌ½…‘µ¥¸…¹±½œ¥¸¸œ°(€€€€€€É•…Ñ”„¹•ÜA½İ•ÈµUÀ€¡½È™¥¹å½ÕÈA$­•ä½¸Ñ¡…ĞÁ…”¤…¹½ÁäÑ¡”­•ä¸œ°(€€€€€€±¥¬Q½­•¸¹•áĞÑ¼Ñ¡”­•ä°…ÁÁÉ½Ù”¥Ğ°…¹½ÁäÑ¡”Ñ½­•¸¸œ°(€€€€€€A…ÍÑ”‰½Ñ Ñ¡”­•ä…¹Ñ½­•¸¡•É”¸œ°(€€€t°(€ô°(€€MÑÉ¥Á”œèì(€€€ÍÑ•ÁÌèl(€€€€€€UÍ”Q•ÍĞµ½‘”™¥ÉÍĞè‘…Í¡‰½…É¹ÍÑÉ¥Á”¹½´½Ñ•ÍÑµ½‘”½‘•Ù•±½Á•ÉÌ½…Á¥­•åÌ¸œ°(€€€€€€½ÁäÑ¡”M•É•Ğ­•ä€¡ÍÑ…ÉÑÌİ¥Ñ Í­}Ñ•ÍÑ|¤¸œ°(€€€€€€A…ÍÑ”¥Ğ¡•É”¸Q•ÍĞ­•åÌ…É”Í…™”Ñ¼•áÁ•É¥µ•¹Ğİ¥Ñ ¸œ°(€€€t°(€€€±¥¹¬è€¡ÑÑÁÌè¼½‘…Í¡‰½…É¹ÍÑÉ¥Á”¹½´½Ñ•ÍÑµ½‘”½‘•Ù•±½Á•ÉÌ½…Á¥­•åÌœ°(€ô°(€€!Õ‰MÁ½Ğœèì(€€€ÍÑ•ÁÌèl(€€€€€€=Á•¸!Õ‰MÁ½ĞM•ÑÑ¥¹Ì°Ñ¡•¸%¹Ñ•É…Ñ¥½¹Ì°Ñ¡•¸AÉ¥Ù…Ñ”ÁÁÌ¸œ°(€€€€€€É•…Ñ”„ÁÉ¥Ù…Ñ”…ÁÀİ¥Ñ Ñ¡”Í½Á•Ìå½Ô¹••€¡”¹œ¸I4É•…¤¸œ°(€€€€€€½ÁäÑ¡”Ñ½­•¸€¡ÍÑ…ÉÑÌİ¥Ñ Á…Ğ´¤…¹Á…ÍÑ”¥Ğ¡•É”¸œ°(€€€t°(€ô°(€€¸á¸œèì(€€€ÍÑ•ÁÌèl(€€€€€€=Á•¸å½ÕÈİ½É­™±½Ü¥¸¸á¸…¹…‘„]•‰¡½½¬¹½‘”¸œ°(€€€€€€½ÁäÑ¡”AÉ½‘ÕÑ¥½¸UI0¸œ°(€€€€€€A…ÍÑ”¥Ğ¡•É”¸Q¡”…•¹Ğ…¸Ñ¡•¸ÑÉ¥•ÈÑ¡…Ğİ½É­™±½Üİ¡•¹•Ù•Èå½Ô…Í¬¸œ°(€€€t°(€ô°(€€5@M•ÉÙ•Èœèì(€€€ÍÑ•ÁÌèl(€€€€€€•ĞÑ¡”UI0½˜…¹ä5@Í•ÉÙ•È€¡MÑÉ•…µ…‰±”!QQ@¤å½Ôİ…¹ĞÑ¼ÕÍ”¸œ°(€€€€€€=ÁÑ¥½¹…±±ä…‘¥ÑÌ‰•…É•ÈÑ½­•¸¸œ°(€€€€€€A…ÍÑ”Ñ¡”UI0¡•É”¸%¹™½É„…ÕÑ¼µ‘¥Í½Ù•ÉÌ¥ÑÌÑ½½±Ì¥¸•¹Ğµ½‘”¸œ°(€€€t°(€ô°(€€ÕÍÑ½´A$œèì(€€€ÍÑ•ÁÌèl(€€€€€€¥¹Ñ¡”A$‘½Õµ•¹Ñ…Ñ¥½¸½˜Ñ¡”Í•ÉÙ¥”å½Ôİ…¹ĞÑ¼½¹¹•Ğ¸œ°(€€€€€€A…ÍÑ”¥ÑÌ‰…Í”UI0€¡”¹œ¸¡ÑÑÁÌè¼½…Á¤¹•á…µÁ±”¹½´¤¸œ°(€€€€€€‘Ñ¡”A$­•ä…¹¥ÑÌ¡•…‘•È¹…µ”¥˜Ñ¡”Í•ÉÙ¥”¹••‘Ì½¹”¸œ°(€€€€€€Q¡”…•¹Ğ¡…¹‘±•ÌÑ¡”…ÕÑ …ÕÑ½µ…Ñ¥…±±ä™É½´Ñ¡•É”¸œ°(€€€t°(€ô°)ôì(ˆˆˆ)µÕÍĞ (€€€€‰q¹ÑåÁ”Q…ˆ€ô€¡ÑåÁ•½˜Q	L¥m¹Õµ‰•Étìˆ°(€€€¡•±Á}ÍÑ•ÁÌ€¬€‰q¹ÑåÁ”Q…ˆ€ô€¡ÑåÁ•½˜Q	L¥m¹Õµ‰•Étìˆ°(¤((Œ€Ì¸%¹Í•ÉĞ¡•±À‰ÕÑÑ½¸‰•™½É”½¹¹5Íœ±¥¹”¥¸½¹¹•Ñ½ÉÌÑ…ˆ)µÕÍĞ (€€€€ˆ€€€€€€€€€í½¹¹5Íœ€˜˜€ñÀ±…ÍÍ9…µ”õp‰…ÉÀ´ÌÑ•áĞµÍµpˆùí½¹¹5Íôğ½Àùôˆ°(€€€€ˆ€€€€€€€€€€ñ‰ÕÑÑ½¹q¸ˆ(€€€€ˆ€€€€€€€€€€€½¹±¥¬õì ¤€ôøÍ•Ñ!•±Á=Á•¸¡ÑÉÕ”¥õq¸ˆ(€€€€ˆ€€€€€€€€€€€±…ÍÍ9…µ”õp‰‰Ñ¸µ½ÕÑ±¥¹”¥¹±¥¹”µ™±•à¥Ñ•µÌµ•¹Ñ•È…À´Ä¸ÔÁà´ÌÁä´Ä¸ÔÑ•áĞµáÍp‰q¸ˆ(€€€€ˆ€€€€€€€€€€ùq¸ˆ(€€€€ˆ€€€€€€€€€€€qÔÈÜÔÌ!½ÜÑ¼½¹¹•Ğ…ÁÁÌqÔÈÀÄĞÍÑ•Àµ‰äµÍÑ•ÀÕ¥‘•q¸ˆ(€€€€ˆ€€€€€€€€€€ğ½‰ÕÑÑ½¸ùq¸ˆ(€€€€ˆ€€€€€€€€€í½¹¹5Íœ€˜˜€ñÀ±…ÍÍ9…µ”õp‰…ÉÀ´ÌÑ•áĞµÍµpˆùí½¹¹5Íôğ½Àùôˆ°(¤((Œ€Ğ¸I•¹‘•Èµ½‘…°…ĞÉ½½Ğ½˜M•ÑÑ¥¹ÌÉ•ÑÕÉ¸)µÕÍĞ (€€€€ˆ€€€€€€¥õq¸€€€€ğ½‘¥Øùq¸€€¤íq¹ôˆ°(€€€€ˆ€€€€€€¥õq¹q¸€€€€€í¡•±Á=Á•¸€˜˜€ñ½¹¹!•±Á5½‘…°½¹±½Í”õì ¤€ôøÍ•Ñ!•±Á=Á•¸¡™…±Í”¥ô€¼ùõq¸€€€€ğ½‘¥Øùq¸€€¤íq¹ôˆ°(¤((Œ€Ô¸ÁÁ•¹µ½‘…°½µÁ½¹•¹Ğ…Ğ•¹½˜™¥±”)µ½‘…°€ô€ˆˆˆ)™Õ¹Ñ¥½¸½¹¹!•±Á5½‘…°¡ì½¹±½Í”ôèì½¹±½Í”è€ ¤€ôøÙ½¥ô¤ì(€É•ÑÕÉ¸€ (€€€€ñ‘¥Ø(€€€€€±…ÍÍ9…µ”ô‰™¥á•¥¹Í•Ğ´Àè´ÔÀ™±•à¥Ñ•µÌµ•¹©ÕÍÑ¥™äµ•¹Ñ•È‰œµ‰±…¬¼ÔÀÀ´ÀÍ´é¥Ñ•µÌµ•¹Ñ•ÈÍ´éÀ´Øˆ(€€€€€½¹±¥¬õí½¹±½Í•ô(€€€€ø(€€€€€€ñ‘¥Ø(€€€€€€€±…ÍÍ9…µ”ô‰…Éµ…àµ µlàÕÙ¡tÜµ™Õ±°µ…àµÜµ±œ½Ù•É™±½Üµäµ…ÕÑ¼É½Õ¹‘•µĞ´Éá°À´ÔÍ´éÉ½Õ¹‘•´Éá°ˆ(€€€€€€€½¹±¥¬õì¡”¤€ôø”¹ÍÑ½ÁAÉ½Á……Ñ¥½¸ ¥ô(€€€€€€ø(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰µˆ´Ì™±•à¥Ñ•µÌµÍÑ…ÉĞ©ÕÍÑ¥™äµ‰•Ñİ••¸…À´Ìˆø(€€€€€€€€€€ñ‘¥Øø(€€€€€€€€€€€€ñ Ì±…ÍÍ9…µ”ô‰Ñ•áĞµ±œ™½¹ĞµÍ•µ¥‰½±ˆù!½ÜÑ¼½¹¹•Ğå½ÕÈ…ÁÁÌğ½ Ìø(€€€€€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰Ñ•áĞµáÌÑ•áĞµÍÕÉ™…”´ĞÀÀˆùQ¡É•”ÍÑ•ÁÌ°½¹”Á•È…ÁÀqÔÈÀÄĞÑ¡•¸Ñ¡”İ¡½±”Ñ•…´…¸ÕÍ”¥Ğ¥¸•¹Ğµ½‘”¸ğ½Àø(€€€€€€€€€€ğ½‘¥Øø(€€€€€€€€€€ñ‰ÕÑÑ½¸½¹±¥¬õí½¹±½Í•ô±…ÍÍ9…µ”ô‰‰Ñ¸µ¡½ÍĞÁà´ÈÁä´ÄÑ•áĞµÍ´ˆùqÔÈÜÄÔğ½‰ÕÑÑ½¸ø(€€€€€€€€ğ½‘¥Øø(€€€€€€€€ñ½°±…ÍÍ9…µ”ô‰µˆ´Ì±¥ÍĞµ‘•¥µ…°ÍÁ…”µä´ÄÁ°´ÔÑ•áĞµÍ´Ñ•áĞµÍÕÉ™…”´ØÀÀ‘…É¬éÑ•áĞµÍÕÉ™…”´ÌÀÀˆø(€€€€€€€€€€ñ±¤ù±¥¬€ñÍÁ…¸±…ÍÍ9…µ”ô‰™½¹Ğµµ•‘¥Õ´ˆù½¹¹•Ğğ½ÍÁ…¸ø½¸…¸…ÁÀ¥¸Ñ¡”½¹¹•Ñ½ÉÌÑ…ˆ¸ğ½±¤ø(€€€€€€€€€€ñ±¤ù=Á•¸Ñ¡…Ğ…ÁÀ…¹½Áä¥ÑÌ­•ä½ÈÑ½­•¸qÔÈÀÄĞ•á…ĞÍÑ•ÁÌ™½È•Ù•Éä…ÁÀ…É”‰•±½Ü¸ğ½±¤ø(€€€€€€€€€€ñ±¤ùA…ÍÑ”¥Ğ‰…¬…¹¡¥Ğ€ñÍÁ…¸±…ÍÍ9…µ”ô‰™½¹Ğµµ•‘¥Õ´ˆùM…Ù”½¹¹•Ñ¥½¸ğ½ÍÁ…¸ø¸½¹”¸ğ½±¤ø(€€€€€€€€ğ½½°ø(€€€€€€€€ñÀ±…ÍÍ9…µ”ô‰µˆ´ĞÑ•áĞµáÌÑ•áĞµÍÕÉ™…”´ĞÀÀˆø(€€€€€€€€€™Ñ•ÈÍ…Ù¥¹œ°©ÕÍĞ…Í¬%¹™½É„¥¸•¹Ğµ½‘”qÔÈÀÄĞ”¹œ¸Í•…É µä9½Ñ¥½¸™½ÈÑ¡”±…Õ¹ Á±…¸¸-•åÌ…É”Í¡…É•İ¥Ñ å½ÕÈİ¡½±”Ñ•…´¸(€€€€€€€€ğ½Àø(€€€€€€€€ñ‘¥Ø±…ÍÍ9…µ”ô‰ÍÁ…”µä´Èˆø(€€€€€€€€€íAIMQL¹µ…À ¡À¤€ôøì(€€€€€€€€€€€½¹ÍĞœ€ô!1A}MQAMmÀ¹¹…µ•tì(€€€€€€€€€€€¥˜€ …œ¤É•ÑÕÉ¸¹Õ±°ì(€€€€€€€€€€€É•ÑÕÉ¸€ (€€€€€€€€€€€€€€ñ‘•Ñ…¥±Ì­•äõíÀ¹¹…µ•ô±…ÍÍ9…µ”ô‰É½ÕÀÉ½Õ¹‘•µ±œ‰½É‘•È‰½É‘•ÈµÍÕÉ™…”´ÈÀÀÀ´Ì‘…É¬é‰½É‘•ÈµÍÕÉ™…”´àÀÀˆø(€€€€€€€€€€€€€€€€ñÍÕµµ…Éä±…ÍÍ9…µ”ô‰™±•àÕÉÍ½ÈµÁ½¥¹Ñ•È±¥ÍĞµ¹½¹”¥Ñ•µÌµ•¹Ñ•È…À´ÈÑ•áĞµÍ´™½¹Ğµµ•‘¥Õ´ˆø(€€€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰Ñ•áĞµ±œˆùíÀ¹¥½¹ôğ½ÍÁ…¸ø(€€€€€€€€€€€€€€€€€íÀ¹¹…µ•ô(€€€€€€€€€€€€€€€€€€ñÍÁ…¸±…ÍÍ9…µ”ô‰µ°µ…ÕÑ¼Ñ•áĞµáÌÑ•áĞµÍÕÉ™…”´ĞÀÀÑÉ…¹Í¥Ñ¥½¸µÑÉ…¹Í™½É´É½ÕÀµ½Á•¸éÉ½Ñ…Ñ”´ÄàÀˆùqÔÈÕ‰Œğ½ÍÁ…¸ø(€€€€€€€€€€€€€€€€ğ½ÍÕµµ…Éäø(€€€€€€€€€€€€€€€€ñ½°±…ÍÍ9…µ”ô‰µĞ´È±¥ÍĞµ‘•¥µ…°ÍÁ…”µä´ÄÁ°´ÔÑ•áĞµáÌÑ•áĞµÍÕÉ™…”´ØÀÀ‘…É¬éÑ•áĞµÍÕÉ™…”´ÌÀÀˆø(€€€€€€€€€€€€€€€€€íœ¹ÍÑ•ÁÌ¹µ…À ¡Ì°¤¤€ôø€ (€€€€€€€€€€€€€€€€€€€€ñ±¤­•äõí¥ôùíÍôğ½±¤ø(€€€€€€€€€€€€€€€€€€¤¥ô(€€€€€€€€€€€€€€€€ğ½½°ø(€€€€€€€€€€€€€€€íœ¹±¥¹¬€˜˜€ (€€€€€€€€€€€€ƒÒÆ¢‡&Vc×¶ræÆ–æ·Ğ¢F&vWCÒ%ö&Ææ² ¢&VÃÒ&æ÷&VfW'&W" ¢6Æ74æÖSÒ&×BÓ"–æÆ–æRÖ&Æö6²FW‡B×‡2föçBÖÖVF—VÒFW‡BÖ66VçBÓc†÷fW#§VæFW&Æ–æRF&³§FW‡BÖ66VçBÓC ¢à¢÷Vâ·ææÖWÒÇS#“ ¢Âöà¢—Ğ¢ÂöFWF–Ç3à¢“°¢Ò—Ğ¢ÂöF—cà¢ÂöF—cà¢ÂöF—cà¢“°§Ğ¢"" §7&2Ò7&2ç'7G&—‚uÆâr’²uÆâr²ÖöFÀ ¦76W'B7&2Ò÷&–p¦÷Vâ…D‚ÂwrrÂVæ6öF–æsÒwWFbÓ‚r’çw&—FR‡7&2§&–çB‚$ô³¢F6†VB"ÂD‚Â"ÒæWrÆVæwF‚"ÂÆVâ‡7&2’ 