import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

type Mode = 'login' | 'signup' | 'forgot';

export default function Auth() {
  const [params] = useSearchParams();
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'signup' ? 'signup' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const navigate = useNavigate();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate('/dashboard');
      } else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name || undefined } },
        });
        if (error) throw error;
        const { data } = await supabase.auth.getSession();
        if (data.session) navigate('/dashboard');
        else setNotice('Check your inbox to confirm your email, then log in.');
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth`,
        });
        if (error) throw error;
        setNotice('Password reset email sent. Check your inbox.');
      }
    } catch (err: any) {
      setError(err?.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-100 px-4 dark:bg-surface-950">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Link to="/" className="inline-flex items-center gap-2">
            <svg width="28" height="28" viewBox="0 0 32 32">
              <circle cx="16" cy="16" r="13" fill="none" stroke="#3375ff" strokeWidth="3" />
              <circle cx="16" cy="16" r="5" fill="#3375ff" />
            </svg>
            <span className="text-xl font-semibold tracking-tight">Synapse</span>
          </Link>
        </div>

        <div className="card p-6">
          <h1 className="text-lg font-semibold">
            {mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Create your workspace' : 'Reset password'}
          </h1>
          <p className="mt-1 text-sm text-surface-500">
            {mode === 'login' && 'Log in to continue to your AI workspace.'}
            {mode === 'signup' && 'Create your account to join the team.'}
            {mode === 'forgot' && "We'll email you a reset link."}
          </p>

          <form onSubmit={submit} className="mt-5 space-y-3">
            {mode === 'signup' && (
              <input className="input" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
            )}
            <input
              className="input"
              type="email"
              placeholder="Email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {mode !== 'forgot' && (
              <input
                className="input"
                type="password"
                placeholder="Password"
                required
                minLength={6}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}

            {error && (
              <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">{error}</p>
            )}
            {notice && (
              <p className="rounded-lg bg-accent-500/10 px-3 py-2 text-sm text-accent-700 dark:text-accent-300">{notice}</p>
            )}

            <button type="submit" disabled={busy} className="btn-primary w-full py-2">
              {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : mode === 'signup' ? 'Sign up' : 'Send reset link'}
            </button>
          </form>

          <div className="mt-4 flex items-center justify-between text-xs text-surface-500">
            {mode === 'login' ? (
              <>
                <button onClick={() => setMode('signup')} className="hover:text-accent-600">Create account</button>
                <button onClick={() => setMode('forgot')} className="hover:text-accent-600">Forgot password?</button>
              </>
            ) : (
              <button onClick={() => setMode('login')} className="hover:text-accent-600">← Back to log in</button>
            )}
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-surface-400">
          <Link to="/" className="hover:text-accent-600">← Back to home</Link>
        </p>
      </div>
    </div>
  );
}
