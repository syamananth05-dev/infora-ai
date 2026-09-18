import sys, os

root = sys.argv[1] if len(sys.argv) > 1 else '.'
sp = os.path.join(root, 'src', 'components', 'Sidebar.tsx')
s = open(sp).read()

def rep(content, old, new, count=None):
    assert old in content, 'anchor missing: ' + old[:80]
    if count is None:
        assert content.count(old) == 1, 'anchor not unique: ' + old[:80]
        return content.replace(old, new)
    return content.replace(old, new)

# 1. delete handler in Sidebar()
s = rep(s, """  const handleSignOut = async () => {
    await supabase.auth.signOut();
    qc.clear();
    navigate('/auth');
  };""",
        """  const handleSignOut = async () => {
    await supabase.auth.signOut();
    qc.clear();
    navigate('/auth');
  };

  const handleDeleteConv = async (c: Conversation) => {
    if (!window.confirm(`Delete "${c.title}"? Its messages will be deleted too.`)) return;
    const { error } = await supabase.from('conversations').delete().eq('id', c.id);
    if (error) { window.alert('Could not delete this chat: ' + error.message); return; }
    qc.invalidateQueries({ queryKey: ['conversations'] });
    if (location.pathname === `/chat/${c.id}`) navigate('/chat');
  };""")

# 2. pass onDelete to ConvItem (pinned + grouped)
s = rep(s, "active={activeChat && location.pathname === `/chat/${c.id}`} onClose={setSidebar} />",
        "active={activeChat && location.pathname === `/chat/${c.id}`} onClose={setSidebar} onDelete={handleDeleteConv} />", count=2)

# 3. ConvItem signature
s = rep(s, """function ConvItem({
  conv,
  active,
  onClose,
}: {
  conv: Conversation;
  active: boolean;
  onClose: (o: boolean) => void;
}) {""",
        """function ConvItem({
  conv,
  active,
  onClose,
  onDelete,
}: {
  conv: Conversation;
  active: boolean;
  onClose: (o: boolean) => void;
  onDelete: (c: Conversation) => void;
}) {""")

# 4. delete button + time on wider screens
s = rep(s, """      {conv.pinned && <span className="text-[10px] text-accent-500">★</span>}
      <span className="truncate">{conv.title}</span>
      <span className="ml-auto shrink-0 text-[10px] text-surface-400 group-hover:hidden">{timeAgo(conv.updated_at)}</span>
    </Link>""",
        """      {conv.pinned && <span className="text-[10px] text-accent-500">★</span>}
      <span className="truncate">{conv.title}</span>
      <span className="ml-auto hidden shrink-0 text-[10px] text-surface-400 group-hover:hidden sm:block">{timeAgo(conv.updated_at)}</span>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(conv); }}
        className="shrink-0 rounded px-1 py-0.5 text-xs text-surface-400 hover:bg-red-500/10 hover:text-red-500"
        title="Delete chat"
        aria-label="Delete chat"
      >
        🗑
      </button>
    </Link>""")

open(sp, 'w').write(s)
print('Sidebar.tsx patched (delete chat + per-user)')
