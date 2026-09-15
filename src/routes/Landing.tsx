import { Link, Navigate } from 'react-router-dom';
import { useSession } from '../hooks/useSession';

const FEATURES = [
  { icon: '🧠', title: 'Model-agnostic intelligence', text: 'Every frontier model through OpenRouter — switch mid-conversation, compare, and route by task.' },
  { icon: '🗂', title: 'Projects with context', text: 'Group chats, instructions, and files into durable workspaces the AI actually remembers.' },
  { icon: '🌿', title: 'Branch any conversation', text: 'Explore alternatives without destroying history. Every message can fork a new path.' },
  { icon: '🔐', title: 'Private by architecture', text: 'Your data is isolated at the database layer. The master key never touches your browser.' },
];

export default function Landing() {
  const { session, loading } = useSession();
  if (!loading && session) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-surface-950 text-surface-100">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[480px] opacity-60"
        style={{
          background:
            'radial-gradient(600px 300px at 20% 0%, rgba(51,117,255,.25), transparent), radial-gradient(500px 260px at 80% 10%, rgba(90,60,220,.18), transparent)',
        }}
      />
      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col px-6">
        {/* Nav */}
        <header className="flex items-center justify-between py-6">
          <div className="flex items-center gap-2.5">
            <svg width="26" height="26" viewBox="0 0 32 32">
              <circle cx="16" cy="16" r="13" fill="none" stroke="#3375ff" strokeWidth="3" />
              <circle cx="16" cy="16" r="5" fill="#3375ff" />
            </svg>
            <span className="text-lg font-semibold tracking-tight">Synapse</span>
          </div>
          <nav className="flex items-center gap-3">
            <Link to="/auth" className="btn-ghost">Log in</Link>
            <Link to="/auth?mode=signup" className="btn-primary">Get started</Link>
          </nav>
        </header>

        {/* Hero */}
        <main className="flex flex-1 flex-col items-center justify-center py-16 text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-surface-700 bg-surface-900/60 px-3 py-1 text-xs text-surface-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-400" />
            Your models. Your data. Your platform.
          </div>
          <h1 className="max-w-2xl text-balance text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            A personal AI
            <span className="bg-gradient-to-r from-accent-400 to-violet-400 bg-clip-text text-transparent"> operating system</span>
          </h1>
          <p className="mt-5 max-w-xl text-pretty text-lg leading-relaxed text-surface-400">
            Every frontier model, long-term memory, projects, and file intelligence — in one private workspace you own.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/auth?mode=signup" className="btn-primary px-5 py-2.5 text-base">Create your workspace</Link>
            <Link to="/auth" className="btn-outline px-5 py-2.5 text-base border-surface-700 text-surface-200">I have an account</Link>
          </div>
        </main>

        {/* Features */}
        <div className="grid gap-4 pb-20 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-surface-800 bg-surface-900/50 p-5 text-left backdrop-blur">
              <div className="text-xl">{f.icon}</div>
              <h3 className="mt-2 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-surface-400">{f.text}</p>
            </div>
          ))}
        </div>

        <footer className="border-t border-surface-800/60 py-6 text-center text-xs text-surface-500">
          Synapse — a personal AI intelligence platform. Phase 1.
        </footer>
      </div>
    </div>
  );
}
