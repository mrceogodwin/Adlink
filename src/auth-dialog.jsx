import React, { useState } from 'react';
import './auth-dialog.css';

export default function AuthDialog({ initialMode = 'login', onClose }) {
  const [mode, setMode] = useState(initialMode);
  const [role, setRole] = useState('advertiser');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const response = await fetch(mode === 'login' ? '/api/auth/login' : '/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email, password, displayName, role }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'We could not complete your request.');
      const accountRole = body.profile?.role;
      window.location.assign(accountRole === 'super_admin' || accountRole === 'admin' ? '/admin' : '/dashboard');
    } catch (e) {
      setError(e.message || 'Connection failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="auth-overlay" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <button type="button" className="auth-close" onClick={onClose} aria-label="Close">×</button>
      <div className="auth-brand-mark">a<span>.</span></div>
      <div className="auth-eyebrow">{mode === 'login' ? 'WELCOME BACK' : 'JOIN THE MARKETPLACE'}</div>
      <h2 id="auth-title">{mode === 'login' ? 'Good to see you.' : 'Make your audience count.'}</h2>
      <p className="auth-subtitle">{mode === 'login' ? 'Sign in to manage your campaigns and placements.' : 'Create an advertiser or publisher account to get started.'}</p>
      <div className="auth-tabs"><button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => {setMode('login');setError('');}}>Log in</button><button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => {setMode('register');setError('');}}>Create account</button></div>
      <form onSubmit={submit}>
        {mode === 'register' && <>
          <label>Your name<input autoComplete="name" value={displayName} onChange={e => setDisplayName(e.target.value)} required minLength={2} maxLength={100} placeholder="Your name or business name" /></label>
          <label>I'm joining as<select value={role} onChange={e => setRole(e.target.value)}><option value="advertiser">Advertiser — promote a brand</option><option value="publisher">Publisher — list ad placements</option></select></label>
        </>}
        <label>Email address<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required maxLength={254} placeholder="you@example.com" /></label>
        <label>Password<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={mode === 'login' ? 1 : 12} maxLength={200} placeholder={mode === 'login' ? 'Enter your password' : 'At least 12 characters'} /></label>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="auth-submit" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in securely ↗' : 'Create account ↗'}</button>
      </form>
      <p className="auth-footnote">Your session is protected with an HttpOnly cookie. Admin privileges cannot be selected during public registration.</p>
    </section>
  </div>;
}
