import React, { useState } from 'react';
import './dashboard.css';
import './admin.css';

const sections = [
 ['Overview','◫'],['User management','♙'],['Publisher approvals','✓'],['Placements','▦'],['Campaigns & bookings','↗'],['Payments & disputes','₦'],['Reports & audit logs','≋'],['Platform settings','⚙']
];
const queues = [
 ['Publisher approvals','Review new publisher applications and verification evidence','Open queue'],
 ['Marketplace moderation','Review submitted, reported and paused placements','Review placements'],
 ['Bookings & disputes','Monitor booking lifecycle, delivery proof and disputes','Review bookings'],
 ['Payment reconciliation','Match payment webhooks with recorded campaign payments','View payments']
];
export default function Admin(){
 const [active,setActive]=useState('Overview');
 const [notice,setNotice]=useState('');
 return <div className="dashboard-shell admin-shell">
  <aside className="dash-sidebar">
   <a className="dash-brand" href="/"><span className="dash-brand-mark"><svg viewBox="0 0 40 40"><path d="M8 13.5 13.5 8a7 7 0 0 1 9.9 0l2.2 2.2-4.2 4.2-2.2-2.2a1.1 1.1 0 0 0-1.5 0l-5.5 5.5a1.1 1.1 0 0 0 0 1.5l2.2 2.2-4.2 4.2L8 23.4a7 7 0 0 1 0-9.9Z" fill="currentColor"/><path d="m32 26.5-5.5 5.5a7 7 0 0 1-9.9 0l-2.2-2.2 4.2-4.2 2.2 2.2a1.1 1.1 0 0 0 1.5 0l5.5-5.5a1.1 1.1 0 0 0 0-1.5l-2.2-2.2 4.2-4.2 2.2 2.2a7 7 0 0 1 0 9.9Z" fill="currentColor"/></svg></span><span>adlink</span></a>
   <div className="admin-private-badge"><span>◆</span><div><strong>Owner control room</strong><small>Private admin area</small></div></div>
   <div className="dash-nav-label">ADMINISTRATION</div>
   <nav className="dash-nav">{sections.map(([name,icon])=><button key={name} className={active===name?'selected':''} onClick={()=>setActive(name)}><span className="dash-nav-icon">{icon}</span>{name}</button>)}</nav>
   <div className="dash-sidebar-bottom"><div className="admin-security-note"><strong>Security first</strong><p>This interface must be protected by verified server-side super_admin authorization before production use.</p></div><a className="dash-back-home" href="/">← Back to marketplace</a></div>
  </aside>
  <main className="dash-main">
   <header className="dash-topbar"><div className="dash-breadcrumb">Admin <span>/</span> {active}</div><div className="dash-top-actions"><span className="admin-preview-pill"><i/> UI PREVIEW</span><button className="dash-profile-button" onClick={()=>setNotice('Owner sign-in and role verification are not connected yet.')}><span>◆</span><span className="profile-button-copy"><strong>Owner account</strong><small>Auth not connected</small></span></button></div></header>
   <section className="dash-content">
    <div className="admin-alert"><span>!</span><div><strong>Private dashboard foundation — not yet access protected</strong><p>This is the owner control-room interface. Do not treat the route itself as security. Every admin API and action must verify the signed-in user's super_admin role on the server.</p></div></div>
    <div className="dash-welcome admin-welcome"><div><div className="dash-eyebrow">ADLINK PLATFORM OPERATIONS</div><h1>{active==='Overview'?'Platform overview':active}</h1><p>Manage marketplace quality, accounts, bookings and platform controls.</p></div><span className="admin-env-chip"><i/> DATA NOT CONNECTED</span></div>
    <div className="dash-stat-grid admin-stat-grid">{[['Registered users','—','Advertisers + publishers'],['Pending approvals','—','Publisher verification queue'],['Open bookings','—','Awaiting campaign progress'],['Payment volume','—','Verified provider events']].map(([label,value,sub])=><article className="dash-stat-card" key={label}><div className="dash-stat-head"><span>{label}</span><i>↗</i></div><strong>{value}</strong><small>{sub}</small></article>)}</div>
    <div className="admin-section-heading"><div><h2>{active==='Overview'?'Operations queues':active}</h2><p>Live records will appear after protected admin APIs are connected.</p></div><span>0 LIVE RECORDS</span></div>
    <div className="admin-queue-grid">{queues.map(([title,desc,action])=><article className="admin-queue-card" key={title}><div className="admin-queue-top"><span className="admin-queue-icon">{title.startsWith('Publisher')?'✓':title.startsWith('Marketplace')?'▦':title.startsWith('Bookings')?'↗':'₦'}</span><span className="admin-queue-state">NOT CONNECTED</span></div><h3>{title}</h3><p>{desc}</p><button onClick={()=>setNotice(action+' requires the protected admin API and verified owner session.')}>{action} ↗</button></article>)}</div>
    <div className="admin-checklist-panel"><div><h2>Production security checklist</h2><p>These controls must pass before owner operations are enabled.</p></div>{['Verified server-side session on every admin request','Owner role provisioned securely; no public self-promotion','Audit log for sensitive changes and approvals','Payment events verified with provider signatures','User data scoped by account and role'].map((item,i)=><div className="admin-check-row" key={item}><span>{String(i+1).padStart(2,'0')}</span><strong>{item}</strong><em>Pending</em></div>)}</div>
    <footer className="dash-footer"><span>© 2026 Adlink</span><span>Owner controls require verified authorization.</span><a href="/">Marketplace home ↗</a></footer>
   </section>
  </main>
  {notice&&<div className="dash-toast" role="status">{notice}<button onClick={()=>setNotice('')} aria-label="Dismiss">×</button></div>}
 </div>
}
