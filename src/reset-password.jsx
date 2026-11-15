import React, { useState } from 'react';
import './dashboard.css';

export default function ResetPassword() {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [password,setPassword] = useState('');
  const [confirm,setConfirm] = useState('');
  const [error,setError] = useState('');
  const [done,setDone] = useState(false);
  const [busy,setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setError('');
    if (password !== confirm) { setError('The passwords do not match.'); return; }
    setBusy(true);
    try {
      const response = await fetch('/api/auth/password-reset',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({token,password})});
      const result = await response.json().catch(()=>({}));
      if (!response.ok) throw new Error(result.error || 'Could not reset password.');
      setDone(true);
    } catch (e) { setError(e.message || 'Could not reset password.'); }
    finally { setBusy(false); }
  }
  return <main className="auth-page">
    <a className="auth-brand" href="/">adlink</a>
    <section className="auth-card">
      <div className="dash-eyebrow">ADLINK PRIVATE ADMIN</div>
      <h1>{done ? 'Password updated.' : 'Set a new password.'}</h1>
      <p className="auth-subtitle">{done ? 'Your Super Admin password has been changed and previous sessions have been signed out.' : 'Choose a new password to restore access to your owner account.'}</p>
      {!done && <form className="auth-form" onSubmit={submit}>
        <label>New password<input type="password" required minLength={12} maxLength={200} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 12 characters"/></label>
        <label>Confirm new password<input type="password" required minLength={12} maxLength={200} autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Enter it again"/></label>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="auth-submit" disabled={busy || !token}>{busy?'Updating password…':'Update password'}</button>
      </form>}
      {done && <a className="auth-submit" href="/login?next=/admin">Continue to Super Admin login</a>}
      {!token && <p className="auth-error">Reset token is missing. Request a new reset link.</p>}
    </section>
  </main>;
}
