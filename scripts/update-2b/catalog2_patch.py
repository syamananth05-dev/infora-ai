import sys, os

root = sys.argv[1] if len(sys.argv) > 1 else '.'

sp = os.path.join(root, 'src', 'routes', 'Settings.tsx')
s = open(sp).read()

def rep(content, old, new, count=None):
    assert old in content, 'anchor missing: ' + old[:70]
    if count is None:
        assert content.count(old) == 1, 'anchor not unique: ' + old[:70]
        return content.replace(old, new)
    return content.replace(old, new)

s = rep(s, ".select('name,type,updated_at');", ".select('name,type,updated_at,config');")
s = rep(s, "return data as { name: string; type: string; updated_at: string }[];",
        "return data as { name: string; type: string; updated_at: string; config?: Record<string, string> }[];")
s = rep(s, "  const connectedNames = new Set((connectors ?? []).map((c) => c.name));",
        """  const connectedNames = new Set((connectors ?? []).map((c) => c.name));
  const partialNames = new Set(
    (connectors ?? [])
      .filter((c) => c.type === 'mcp' && ((c.config?.auth === 'oauth') || (c.config?.auth === 'key' && !c.config?.token)))
      .map((c) => c.name)
  );""")
s = rep(s, "connectedNames={connectedNames} />", "connectedNames={connectedNames} partialNames={partialNames} />")
open(sp, 'w').write(s)
print('Settings.tsx patched')

cp = os.path.join(root, 'src', 'components', 'CatalogModal.tsx')
c = open(cp).read()

c = rep(c, "  connected,\n  onOpen,", "  connected,\n  partial,\n  onOpen,")
c = rep(c, "  connected: boolean;\n  onOpen: () => void;", "  connected: boolean;\n  partial?: boolean;\n  onOpen: () => void;")
c = rep(c, "        {connected ? (\n          <span className=\"shrink-0 text-xs font-medium text-emerald-600 dark:text-emerald-400\">✓ Connected</span>\n        ) : (",
        """        {connected ? (
          partial ? (
            <span className="shrink-0 text-xs font-medium text-amber-600 dark:text-amber-400">⚠ Needs sign-in</span>
          ) : (
            <span className="shrink-0 text-xs font-medium text-emerald-600 dark:text-emerald-400">✓ Connected</span>
          )
        ) : (""")
c = rep(c, "  onClose,\n  connectedNames,\n}:", "  onClose,\n  connectedNames,\n  partialNames,\n}:")
c = rep(c, "  connectedNames: Set<string>;\n}) {", "  connectedNames: Set<string>;\n  partialNames: Set<string>;\n}) {")
c = rep(c, "      if (t) config.token = t;", "      if (t) config.token = t;\n      if (item.a) config.auth = item.a;")
c = rep(c, "      setMsg(`${item.n} connected! Ask Infora in Agent mode to use it.`);",
        """      if (!t && item.a === 'oauth') {
        setMsg(`${item.n} URL saved — but this app needs sign-in before it can be used (one-click sign-in is coming). Meanwhile: paste a token above if you have one, or use the app's preset in the Connectors tab.`);
      } else if (!t && item.a === 'key') {
        setMsg(`${item.n} URL saved — this server needs an API key. Create a (usually free) key on the provider's site, paste it above, and reconnect.`);
      } else {
        setMsg(`${item.n} connected! Ask Infora in Agent mode to use it.`);
      }""")
c = rep(c, "                    connected={connectedNames.has(item.n)}",
        "                    connected={connectedNames.has(item.n)}\n                    partial={partialNames.has(item.n)}", count=2)
open(cp, 'w').write(c)
print('CatalogModal.tsx patched')
