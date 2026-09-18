import os
import sys

root = sys.argv[1] if len(sys.argv) > 1 else '.'

chip_tsx = r'''import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from '../hooks/useSession';

export default function CreditsChip() {
  const { session } = useSession();
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('video', { body: { action: 'balance' } });
      if (!error && data && typeof data.balance === 'number') setBalance(data.balance);
    } catch {}
    setLoading(false);
  }, [session]);

  useEffect(() => {
    refresh();
    const iv = window.setInterval(refresh, 300000);
    return () => window.clearInterval(iv);
  }, [refresh]);

  if (!session) return null;

  return (
    <button
      onClick={refresh}
      title="Your credits. Videos cost 10 credits - everything else is free. Tap to refresh."
      className="mx-2 mb-2 mt-1 flex w-[calc(100%-1rem)] items-center justify-between rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-left"
    >
      <span className="text-xs font-medium text-primary">⚡ Credits</span>
      <span className="text-sm font-bold text-primary">
        {loading && balance === null ? '…' : balance === null ? '—' : balance}
      </span>
    </button>
  );
}
'''

open(os.path.join(root, 'src', 'components', 'CreditsChip.tsx'), 'w').write(chip_tsx)

# Patch Sidebar.tsx: add import (after the last import line) + render chip before Projects nav
sp = os.path.join(root, 'src', 'components', 'Sidebar.tsx')
s = open(sp).read()

lines = s.split('\n')
last_import = max(i for i, l in enumerate(lines) if l.startswith('import '))
lines.insert(last_import + 1, "import CreditsChip from './CreditsChip';")
s = '\n'.join(lines)

nav_anchor = '        <NavLink to="/projects" label="Projects" icon="📁" />'
assert nav_anchor in s, 'Sidebar projects anchor missing'
s = s.replace(nav_anchor, '        <CreditsChip />\n' + nav_anchor, 1)
open(sp, 'w').write(s)

print('Update 4d patched: CreditsChip component + Sidebar integration')
