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
        if (supabase.auth.getSession) {
          // PKCE: session may exist immediately if email confirmation is off
          const { data } = await supabase.auth.getSession();
          if (data.session) navigate('/dashboard');
          else setNotice('Check your inbox to confirm your email, then log in.');
        }
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

  const google = async () => {
    setError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
    if (error) setError(error.message);
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
            {mode === 'signup' && 'One account for your personal AI platform.'}
            {mode === 'forgot' && "We'll email you a reset link."}
          </p>

          <button onClick={google} className="btn-outline mt-5 w-full py-2">
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.02.15 3.5 2.7.24.02c2.2-2 3.5-5 3.5-8.6z" />
              <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.1 0-5.8-2.1-6.8-5l-.14.01-3.6 2.8-.05.13C3.3 21.3 7.3 24 12 24z" />
              <path fill="#FBBC05" d="M5.2 14.4c-.24-.72-.38-1.5-.38-2.4s.14-1.68.37-2.4l-.01-.16L1.55 6.6l-.12.06C.5 8.3 0 10.1 0 12s.5 3.7 1.43 5.34l3.77-2.94z" />
              <path fill="#EA4335" d="M12 4.6c2.2 0 3.7.95 4.6 1.75l3.35-3.27C17.9 1.14 15.2 0 12 0 7.3 0 3.3 2.7 1.43 6.66l3.77 2.94c1-2.9 3.7-5 6.8-5z" />
            </svg>
            Continue with Google
          </button>

          <div className="my-4 flex items-center gap-3 text-xs text-surface-400">
            <div className="h-px flex-1 bg-surface-200 dark:bg-surface-800" />
            or
            <div className="h-px flex-1 bg-surface-200 dark:bg-surface-800" />
          </div>

          <form onSubmit={submit} className="space-y-3">
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
