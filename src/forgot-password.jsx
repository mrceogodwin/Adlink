import React, { useState } from 'react';
import './dashboard.css';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const response = await fetch('/api/auth/request-password-reset', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not request a reset link.');
      setSent(true);
    } catch (e) {
      setError(e.message || 'Could not request a reset link.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-page">
    <a className="auth-brand" href="/">adlink</a>
    <section className="auth-card">
      <div className="dash-eyebrow">ADLINK PRIVATE ADMIN</div>
      <h1>{sent ? 'Check your inbox.' : 'Reset your password.'}</h1>
      <p className="auth-subtitle">{sent ? 'If this email belongs to an active Super Admin account, a password reset link has been sent.' : 'Enter the email address associated with your Super Admin account. We will send a secure, one-time reset link.'}</p>
      {!sent && <form className="auth-form" onSubmit={submit}>
        <label>Email address<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></label>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="auth-submit" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
      </form>}
      <a className="auth-home-link" href="/login?next=/admin">← Back to Super Admin login</a>
    </section>
  </main>;
}
