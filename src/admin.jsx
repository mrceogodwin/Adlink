import React, { useEffect, useState } from 'react';
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
 const [authState,setAuthState]=useState('checking');
 const [overview,setOverview]=useState(null);
 const [dataError,setDataError]=useState('');
 useEffect(()=>{let alive=true;fetch('/api/auth/me',{credentials:'same-origin'}).then(async r=>{const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error('Sign in required');if(data.profile?.role!=='super_admin')throw new Error('Owner access required');if(alive){setAuthState('authorized');fetch('/api/admin-overview',{credentials:'same-origin'}).then(async response=>{const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||'Could not load admin data.');if(alive)setOverview(result);}).catch(error=>{if(alive)setDataError(error.message||'Admin data unavailable.');});}}).catch(()=>{if(alive){setAuthState('denied');window.location.replace('/login?next=/admin');}});return()=>{alive=false;};},[]);
 const [notice,setNotice]=useState('');
 const [actionBusy,setActionBusy]=useState('');
 async function moderate(entityType,id,action,label){
  if(!window.confirm(`${action==='approve'?'Approve':'Reject'} ${label}?`)) return;
  const key=`${entityType}:${id}`;setActionBusy(key);setNotice('');
  try{
   const response=await fetch('/api/admin-actions',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({entityType,id,action})});
   const result=await response.json().catch(()=>({}));
   if(!response.ok) throw new Error(result.error||'Moderation action failed.');
   const refreshed=await fetch('/api/admin-overview',{credentials:'same-origin'});
   const data=await refreshed.json().catch(()=>({}));
   if(!refreshed.ok) throw new Error(data.error||'Action saved, but the queue could not refresh.');
   setOverview(data);setNotice(`${label} ${action==='approve'?'approved':'rejected'} successfully.`);
  }catch(error){setNotice(error.message||'Moderation action failed.');}
  finally{setActionBusy('');}
 }
 if(authState!=='authorized') return <main className="auth-page"><div className="auth-card"><h1>Verifying owner access…</h1><p className="auth-subtitle">The private control room requires a server-verified super administrator session.</p></div></main>;
 return <div className="dashboard-shell admin-shell">
  <aside className="dash-sidebar">
   <a className="dash-brand" href="/"><span className="dash-brand-mark"><svg viewBox="0 0 40 40"><path d="M8 13.5 13.5 8a7 7 0 0 1 9.9 0l2.2 2.2-4.2 4.2-2.2-2.2a1.1 1.1 0 0 0-1.5 0l-5.5 5.5a1.1 1.1 0 0 0 0 1.5l2.2 2.2-4.2 4.2L8 23.4a7 7 0 0 1 0-9.9Z" fill="currentColor"/><path d="m32 26.5-5.5 5.5a7 7 0 0 1-9.9 0l-2.2-2.2 4.2-4.2 2.2 2.2a1.1 1.1 0 0 0 1.5 0l5.5-5.5a1.1 1.1 0 0 0 0-1.5l-2.2-2.2 4.2-4.2 2.2 2.2a7 7 0 0 1 0 9.9Z" fill="currentColor"/></svg></span><span>adlink</span></a>
   <div className="admin-private-badge"><span>◆</span><div><strong>Owner control room</strong><small>Private admin area</small></div></div>
   <div className="dash-nav-label">ADMINISTRATION</div>
   <nav className="dash-nav">{sections.map(([name,icon])=><button key={name} className={active===name?'selected':''} onClick={()=>setActive(name)}><span className="dash-nav-icon">{icon}</span>{name}</button>)}</nav>
   <div className="dash-sidebar-bottom"><div className="admin-security-note"><strong>Security first</strong><p>This interface must be protected by verified server-side super_admin authorization before production use.</p></div><a className="dash-back-home" href="/">← Back to marketplace</a></div>
  </aside>
  <main className="dash-main">
   <header className="dash-topbar"><div className="dash-breadcrumb">Admin <span>/</span> {active}</div><div className="dash-top-actions"><span className="admin-preview-pill"><i/> {overview?'LIVE DATA':'LOADING DATA'}</span><button className="dash-profile-button" onClick={async()=>{await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'});window.location.assign('/login');}}><span>◆</span><span className="profile-button-copy"><strong>{overview?.profile?.display_name||'Owner account'}</strong><small>{overview?.profile?.email||'Verified owner session'}</small></span></button></div></header>
   <section className="dash-content">
    {dataError&&<div className="admin-alert"><span>!</span><div><strong>Owner data could not load</strong><p>{dataError}</p></div></div>}
    <div className="dash-welcome admin-welcome"><div><div className="dash-eyebrow">ADLINK PLATFORM OPERATIONS</div><h1>{active==='Overview'?'Platform overview':active}</h1><p>Manage marketplace quality, accounts, bookings and platform controls.</p></div><span className="admin-env-chip"><i/> {overview?'DATABASE CONNECTED':'CONNECTING DATABASE'}</span></div>
    <div className="dash-stat-grid admin-stat-grid">{[['Registered users',overview?.stats?.users??'—','Advertisers + publishers'],['Pending approvals',overview?.stats?.pending_publishers??'—','Publisher verification queue'],['Open bookings',overview?.stats?.open_bookings??'—','Awaiting campaign progress'],['Payment volume',overview?.stats?.payment_volume_minor!=null?'₦'+Math.round(Number(overview.stats.payment_volume_minor)/100).toLocaleString('en-NG'):'—','Recorded successful payment events']].map(([label,value,sub])=><article className="dash-stat-card" key={label}><div className="dash-stat-head"><span>{label}</span><i>↗</i></div><strong>{value}</strong><small>{sub}</small></article>)}</div>
    <div className="admin-section-heading"><div><h2>{active==='Overview'?'Operations queues':active}</h2><p>Queues from the authenticated production database.</p></div><span>{overview?((overview.pendingPublishers?.length||0)+(overview.pendingPlacements?.length||0))+' QUEUED ITEMS':'LOADING'}</span></div>
    <div className="admin-queue-grid">{queues.map(([title,desc,action])=><article className="admin-queue-card" key={title}><div className="admin-queue-top"><span className="admin-queue-icon">{title.startsWith('Publisher')?'✓':title.startsWith('Marketplace')?'▦':title.startsWith('Bookings')?'↗':'₦'}</span><span className="admin-queue-state">{overview?'LIVE QUEUE':'LOADING'}</span></div><h3>{title}</h3><p>{desc}</p><button onClick={()=>setNotice(title==='Publisher approvals'?((overview?.pendingPublishers?.length||0)+' publisher records currently need review.'):title==='Marketplace moderation'?((overview?.pendingPlacements?.length||0)+' placements currently await review.'):action+' queue is read-only until review actions are implemented.')}>{action} ↗</button></article>)}</div>
    {notice&&<div className="admin-alert" role="status"><span>i</span><div><p>{notice}</p></div></div>}
    <div className="admin-review-grid">
     <article className="admin-queue-card"><h3>Publisher verification</h3><p>Approve publishers before their placements can go live.</p>
      {(overview?.pendingPublishers||[]).length===0?<p>No pending publisher applications.</p>:(overview.pendingPublishers||[]).map(item=><div className="admin-review-row" key={item.id}><div><strong>{item.business_name||item.display_name||'Publisher'}</strong><small>{item.email} · {item.verification_status}</small></div><div className="admin-review-actions"><button disabled={!!actionBusy} onClick={()=>moderate('publisher',item.id,'approve',item.business_name||item.email||'publisher')}>{actionBusy===`publisher:${item.id}`?'Saving…':'Approve'}</button><button disabled={!!actionBusy} onClick={()=>moderate('publisher',item.id,'reject',item.business_name||item.email||'publisher')}>Reject</button></div></div>)}
     </article>
     <article className="admin-queue-card"><h3>Placement moderation</h3><p>Publishing is allowed only after the publisher is verified.</p>
      {(overview?.pendingPlacements||[]).length===0?<p>No placements awaiting review.</p>:(overview.pendingPlacements||[]).map(item=><div className="admin-review-row" key={item.id}><div><strong>{item.title}</strong><small>{item.platform} · {item.business_name||'Publisher'}</small></div><div className="admin-review-actions"><button disabled={!!actionBusy} onClick={()=>moderate('placement',item.id,'approve',item.title||'placement')}>{actionBusy===`placement:${item.id}`?'Saving…':'Publish'}</button><button disabled={!!actionBusy} onClick={()=>moderate('placement',item.id,'reject',item.title||'placement')}>Reject</button></div></div>)}
     </article>
    </div>
    <div className="admin-checklist-panel"><div><h2>Production security checklist</h2><p>These controls must pass before owner operations are enabled.</p></div>{['Verified server-side session on every admin request','Owner role provisioned securely; no public self-promotion','Audit log for sensitive changes and approvals','Payment events verified with provider signatures','User data scoped by account and role'].map((item,i)=><div className="admin-check-row" key={item}><span>{String(i+1).padStart(2,'0')}</span><strong>{item}</strong><em>{i===0?'ENFORCED':i===4?'ENFORCED':'PENDING'}</em></div>)}</div>
    <footer className="dash-footer"><span>© 2026 Adlink</span><span>Owner controls require verified authorization.</span><a href="/">Marketplace home ↗</a></footer>
   </section>
  </main>
  {notice&&<div className="dash-toast" role="status">{notice}<button onClick={()=>setNotice('')} aria-label="Dismiss">×</button></div>}
 </div>
}
