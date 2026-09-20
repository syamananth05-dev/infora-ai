import sys

root = sys.argv[1] if len(sys.argv) > 1 else '.'

p = f'{root}/src/routes/SelfBuild.tsx'
s = open(p).read()

pairs = [
    (r'''  const setStatus = async (id: string, status: string) => {''',
     r'''  const handleBuild = async () => {
    setBusy(true);
    setError('');
    const { data, error: e } = await supabase.functions.invoke('selfbuild', { body: { action: 'build_all' } });
    setBusy(false);
    if (e || !data || data.error) {
      setError((e && e.message) || (data && data.error) || 'Build failed');
      return;
    }
    loadList();
    const built: string[] = (data && data.built) || [];
    const failed: string[] = (data && data.failed) || [];
    if (built.length) {
      alert('Built and deploying:\n' + built.join('\n') + (data.deployed ? '\n\nLive in about 2 minutes — refresh the site.' : '\n\nDeploy will start shortly.'));
    } else {
      alert('Nothing built.' + (failed.length ? '\nProblems:\n' + failed.join('\n') : ''));
    }
  };

  const setStatus = async (id: string, status: string) => {'''),
    (r'''        <button onClick={handlePlan} disabled={busy || !request.trim()} className="btn-primary mt-3">
          {busy ? 'Planning…' : '⚡ Plan this feature'}
        </button>''',
     r'''        <button onClick={handlePlan} disabled={busy || !request.trim()} className="btn-primary mt-3">
          {busy ? 'Planning…' : '⚡ Plan this feature'}
        </button>
        <button
          onClick={handleBuild}
          disabled={busy}
          className="btn-outline mt-2 w-full"
          title="The AI writes the actual code, commits it to GitHub and deploys it to the live site"
        >
          🔨 Build planned features now — code + deploy
        </button>'''),
]
for old, new in pairs:
    n = s.count(old)
    if n != 1:
        raise SystemExit(f'anchor count={n}: {old[:60]!r}')
    s = s.replace(old, new, 1)
open(p, 'w').write(s)
print('patched SelfBuild.tsx')
