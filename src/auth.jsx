import React, { useState } from 'react';
import './dashboard.css';

export default function AuthPage() {
  const initialRole = new URLSearchParams(window.location.search).get('role') === 'publisher' ? 'publisher' : 'advertiser';
  const [mode, setMode] = useState(window.location.pathname === '/register' ? 'register' : 'login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(initialRole);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/' + (mode === 'register' ? 'register' : 'login'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ displayName, email, password, role })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not sign you in.');
      const next = new URLSearchParams(window.location.search).get('next');
      window.location.assign(next && next.startsWith('/') && !next.startsWith('//') ? next : result.profile?.role === 'super_admin' ? '/admin' : '/dashboard');
    } catch (err) {
      setError(err.message || 'Connection failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-page">
    <a className="auth-brand" href="/"><span className="dash-brand-mark"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M8 13.5 13.5 8a7 7 0 0 1 9.9 0l2.2 2.2-4.2 4.2-2.2-2.2a1.1 1.1 0 0 0-1.5 0l-5.5 5.5a1.1 1.1 0 0 0 0 1.5l2.2 2.2-4.2 4.2L8 23.4a7 7 0 0 1 0-9.9Z" fill="currentColor"/><path d="m32 26.5-5.5 5.5a7 7 0 0 1-9.9 0l-2.2-2.2 4.2-4.2 2.2 2.2a1.1 1.1 0 0 0 1.5 0l5.5-5.5a1.1 1.1 0 0 0 0-1.5l-2.2-2.2 4.2-4.2 2.2 2.2a7 7 0 0 1 0 9.9Z" fill="currentColor"/></svg></span> adlink</a>
    <section className="auth-card">
      <div className="dash-eyebrow">ADLINK MARKETPLACE</div>
      <h1>{mode === 'register' ? 'Make your next connection.' : 'Welcome back.'}</h1>
      <p className="auth-subtitle">{mode === 'register' ? 'Create an account to find audiences or list your advertising inventory.' : 'Sign in to continue to your workspace.'}</p>
      <div className="auth-mode-switch"><button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => {setMode('login');setError('');window.history.replaceState({}, '', '/login');}}>Log in</button><button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => {setMode('register');setError('');window.history.replaceState({}, '', '/register');}}>Create account</button></div>
      <form onSubmit={submit} className="auth-form">
        {mode === 'register' && <label>Full name or business name<input autoComplete="name" required minLength={2} maxLength={100} value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Your name" /></label>}
        <label>Email address<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" /></label>
        <label>Password<input type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required minLength={mode === 'register' ? 12 : 1} maxLength={200} value={password} onChange={e=>setPassword(e.target.value)} placeholder={mode === 'register' ? 'At least 12 characters' : 'Your password'} /></label>
        {mode === 'register' && <label>Account type<select value={role} onChange={e=>setRole(e.target.value)}><option value="advertiser">Advertiser — book placements</option><option value="publisher">Publisher — list your audience</option></select></label>}
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="auth-submit" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'register' ? 'Create my account ↗' : 'Log in securely ↗'}</button>
      </form>
      <p className="auth-legal">Your password is stored as a one-way hash. Admin access cannot be requested through public registration.</p>
    </section>
    <a className="auth-home-link" href="/">← Back to marketplace</a>
  </main>;
}
