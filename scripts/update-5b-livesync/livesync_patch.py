import os
import sys

root = sys.argv[1] if len(sys.argv) > 1 else '.'

def insert_after_line(path, marker, code, occurrence=1):
    s = open(path).read()
    lines = s.split('\n')
    seen = 0
    for i, ln in enumerate(lines):
        if marker in ln:
            seen += 1
            if seen == occurrence:
                lines.insert(i + 1, code)
                open(path, 'w').write('\n'.join(lines))
                return True
    return False

def insert_before_line(path, marker, code):
    s = open(path).read()
    lines = s.split('\n')
    for i, ln in enumerate(lines):
        if marker in ln:
            lines.insert(i, code)
            open(path, 'w').write('\n'.join(lines))
            return True
    return False

# ============ 1. Chat.tsx - live message sync ============

cp = os.path.join(root, 'src', 'routes', 'Chat.tsx')
chat_code = (
    "\n\n  // Live sync (Update 5b): assistant replies from other devices appear automatically\n"
    "  const liveConvId = conversationId ?? '';\n"
    "  useEffect(() => {\n"
    "    if (!liveConvId) return;\n"
    "    const channel = supabase\n"
    "      .channel('chat-live-' + liveConvId)\n"
    "      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${liveConvId}` }, (payload: any) => {\n"
    "        if (payload?.new?.role !== 'assistant') return;\n"
    "        qc.invalidateQueries({ queryKey: ['messages', liveConvId] });\n"
    "        qc.invalidateQueries({ queryKey: ['conversations'] });\n"
    "      })\n"
    "      .subscribe();\n"
    "    return () => { supabase.removeChannel(channel); };\n"
    "  }, [liveConvId, qc]);\n"
)
assert insert_after_line(cp, "useEffect(() => setModel(defaultModel), [defaultModel]);", chat_code), 'Chat anchor missing'

# ============ 2. Tasks.tsx - live task sync ============

tp = os.path.join(root, 'src', 'routes', 'Tasks.tsx')
ts = open(tp).read()
assert "import { useState } from 'react';" in ts, 'Tasks react import missing'
ts = ts.replace("import { useState } from 'react';", "import { useEffect, useState } from 'react';", 1)
open(tp, 'w').write(ts)

tasks_code = (
    "  // Live sync (Update 5b): tasks refresh automatically when anything changes\n"
    "  useEffect(() => {\n"
    "    if (!session?.user?.id) return;\n"
    "    const channel = supabase\n"
    "      .channel('tasks-live')\n"
    "      .on('postgres_changes', { event: '*', schema: 'public', table: 'scheduled_tasks', filter: `user_id=eq.${session.user.id}` }, () => {\n"
    "        qc.invalidateQueries({ queryKey: ['scheduled_tasks'] });\n"
    "      })\n"
    "      .subscribe();\n"
    "    return () => { supabase.removeChannel(channel); };\n"
    "  }, [session?.user?.id, qc]);\n\n"
)
assert insert_before_line(tp, "const { data: runs = [] } = useQuery({", tasks_code), 'Tasks anchor missing'

# ============ 3. Dashboard.tsx - live activity card ============

dp = os.path.join(root, 'src', 'routes', 'Dashboard.tsx')
ds = open(dp).read()
assert "import { timeAgo, formatCost, formatTokens } from '../lib/types';" in ds, 'Dashboard import anchor missing'
ds = ds.replace(
    "import { timeAgo, formatCost, formatTokens } from '../lib/types';",
    "import { timeAgo, formatCost, formatTokens } from '../lib/types';\nimport { useEffect, useState } from 'react';",
    1,
)
open(dp, 'w').write(ds)

dash_state = (
    "\n  const [liveMsgs, setLiveMsgs] = useState(0);\n"
    "  const [liveChats, setLiveChats] = useState(0);\n"
    "  useEffect(() => {\n"
    "    let alive = true;\n"
    "    const tick = async () => {\n"
    "      try {\n"
    "        const start = new Date(); start.setHours(0, 0, 0, 0);\n"
    "        const m = await supabase.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', start.toISOString());\n"
    "        const c = await supabase.from('conversations').select('id', { count: 'exact', head: true }).gte('created_at', start.toISOString());\n"
    "        if (alive) { setLiveMsgs(m.count ?? 0); setLiveChats(c.count ?? 0); }\n"
    "      } catch {}\n"
    "    };\n"
    "    tick();\n"
    "    const id = setInterval(tick, 30000);\n"
    "    return () => { alive = false; clearInterval(id); };\n"
    "  }, []);\n"
)
assert insert_after_line(dp, "export default function Dashboard() {", dash_state), 'Dashboard component anchor missing'

dash_card = (
    "      <div className=\"mb-8 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4\">\n"
    "        <div className=\"flex items-center justify-between\">\n"
    "          <div className=\"flex items-center gap-2\">\n"
    "            <span className=\"relative flex h-2.5 w-2.5\">\n"
    "              <span className=\"absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75\"></span>\n"
    "              <span className=\"relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500\"></span>\n"
    "            </span>\n"
    "            <h2 className=\"text-sm font-semibold\">Live activity today</h2>\n"
    "          </div>\n"
    "          <span className=\"text-xs text-surface-400\">updates every 30s</span>\n"
    "        </div>\n"
    "        <div className=\"mt-3 grid grid-cols-2 gap-3\">\n"
    "          <div><p className=\"text-2xl font-bold\">{liveMsgs}</p><p className=\"text-xs text-surface-400\">messages sent</p></div>\n"
    "          <div><p className=\"text-2xl font-bold\">{liveChats}</p><p className=\"text-xs text-surface-400\">chats started</p></div>\n"
    "        </div>\n"
    "      </div>\n"
)
assert insert_before_line(dp, 'className="grid gap-8 md:grid-cols-2"', dash_card), 'Dashboard grid anchor missing'

print('Update 5b patched: live sync Chat+Tasks + live dashboard card')
