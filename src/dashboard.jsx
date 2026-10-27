import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './dashboard.css';

const menu = [
  ['Overview','◫'],['Campaigns','▤'],['Saved placements','♡'],['Bookings','↗'],['Messages','✉'],['Analytics','⌁'],['Billing','₦'],['Settings','⚙']
];
function Mark(){return <svg viewBox="0 0 40 40" aria-hidden="true"><path d="M8 13.5 13.5 8a7 7 0 0 1 9.9 0l2.2 2.2-4.2 4.2-2.2-2.2a1.1 1.1 0 0 0-1.5 0l-5.5 5.5a1.1 1.1 0 0 0 0 1.5l2.2 2.2-4.2 4.2L8 23.4a7 7 0 0 1 0-9.9Z" fill="currentColor"/><path d="m32 26.5-5.5 5.5a7 7 0 0 1-9.9 0l-2.2-2.2 4.2-4.2 2.2 2.2a1.1 1.1 0 0 0 1.5 0l5.5-5.5a1.1 1.1 0 0 0 0-1.5l-2.2-2.2 4.2-4.2 2.2 2.2a7 7 0 0 1 0 9.9Z" fill="currentColor"/><circle cx="31.5" cy="8.5" r="3.5" fill="#b7e66a"/></svg>}
function Dashboard(){
 const [active,setActive]=useState('Overview');
 const [role,setRole]=useState('Advertiser');
 const [notice,setNotice]=useState('');
 const [authState,setAuthState]=useState('not-connected');
 const items=useMemo(()=>role==='Publisher'?menu.filter(([name])=>!['Saved placements','Billing'].includes(name)):menu,[role]);
 const message='This dashboard layout is ready, but account authentication and protected dashboard APIs are not connected yet. No sample account data is being shown as real.';
 return <div className="dashboard-shell">
  <aside className="dash-sidebar">
   <a className="dash-brand" href="/"><span className="dash-brand-mark"><Mark/></span><span>adlink</span></a>
   <div className="dash-workspace"><span className="workspace-avatar">{role==='Publisher'?'P':'A'}</span><span><strong>{role} workspace</strong><small>Account preview</small></span><span className="workspace-caret">⌄</span></div>
   <div className="dash-nav-label">WORKSPACE</div>
   <nav className="dash-nav">{items.map(([name,icon])=><button key={name} className={active===name?'selected':''} onClick={()=>setActive(name)}><span className="dash-nav-icon">{icon}</span>{name}{name==='Messages'&&<i className="nav-new-dot"/>}</button>)}</nav>
   <div className="dash-sidebar-bottom"><div className="help-card"><span>✳</span><strong>Need a hand?</strong><p>Get help setting up your Adlink workspace.</p><button onClick={()=>setNotice('Support will be connected with the authenticated account system.')}>Contact support ↗</button></div><a className="dash-back-home" href="/">← Back to marketplace</a></div>
  </aside>
  <main className="dash-main">
   <header className="dash-topbar"><div className="dash-breadcrumb">Workspace <span>/</span> {active}</div><div className="dash-top-actions"><span className="dash-preview-pill"><i/> PREVIEW</span><button className="dash-icon-button" aria-label="Notifications" onClick={()=>setNotice('Notifications will appear here after account sign-in.')}>♧</button><button className="dash-profile-button" onClick={()=>setNotice('Profile settings require a signed-in account.')}><span>?</span><span className="profile-button-copy"><strong>Guest account</strong><small>Not signed in</small></span><b>⌄</b></button></div></header>
   <section className="dash-content">
    <div className="dash-welcome"><div><div className="dash-eyebrow">YOUR ADLINK WORKSPACE</div><h1>{active==='Overview'?'Good things start with a plan.':active}</h1><p>Keep your advertising work organised in one place.</p></div><button className="dash-primary" onClick={()=>setNotice('Create campaign will become available after secure sign-in is connected.')}>＋ Create campaign</button></div>
    <div className="dash-role-switch"><span>Preview workspace:</span><button className={role==='Advertiser'?'on':''} onClick={()=>{setRole('Advertiser');setActive('Overview')}}>Advertiser</button><button className={role==='Publisher'?'on':''} onClick={()=>{setRole('Publisher');setActive('Overview')}}>Publisher</button><span className="role-switch-note">Visual preview only · not an access control</span></div>
    <div className="dash-connection-banner"><span className="connection-symbol">!</span><div><strong>Secure account connection still required</strong><p>{message}</p></div><span className="connection-status">NOT CONNECTED</span></div>
    <div className="dash-stat-grid">{[['Campaigns','—','Campaign activity'],['Active bookings','—','Booking status'],['Total spend','—','Verified payments'],[role==='Publisher'?'Placement views':'Saved placements','—',role==='Publisher'?'Listing performance':'Your shortlist']].map(([label,value,sub])=><article className="dash-stat-card" key={label}><div className="dash-stat-head"><span>{label}</span><i>↗</i></div><strong>{value}</strong><small>{sub}</small></article>)}</div>
    <div className="dash-panels"><section className="dash-panel dash-activity-panel"><div className="dash-panel-head"><div><h2>{active==='Overview'?'Recent activity':active}</h2><p>Updates from your workspace will appear here.</p></div><button onClick={()=>setNotice('Activity history requires a verified account session.')}>View all ↗</button></div><div className="dash-empty-activity"><div className="empty-activity-icon">◷</div><strong>Your workspace is waiting for its first activity</strong><p>Once you sign in, your real campaigns, bookings and updates will be shown here.</p><button onClick={()=>setNotice('Secure sign-in is the next integration milestone.')}>Connect account ↗</button></div></section>
    <section className="dash-panel dash-quick-panel"><div className="dash-panel-head"><div><h2>Quick actions</h2><p>Jump into your next step.</p></div></div>{(role==='Publisher'?[['＋','Add a placement','Create an advertising offer'],['✓','Verification','Prepare publisher details'],['↗','Manage bookings','Review incoming requests']]:[['⌕','Find placements','Explore publishers and audiences'],['▤','Start a campaign','Outline your goal and budget'],['♡','Review shortlist','Return to saved opportunities']]).map(([icon,title,desc])=><button className="dash-quick-action" key={title} onClick={()=>setNotice(title+' will be enabled after authentication and protected APIs are complete.')}><span>{icon}</span><span><strong>{title}</strong><small>{desc}</small></span><b>↗</b></button>)}</section></div>
    <div className="dash-next-step"><span className="next-step-icon"><Mark/></span><div><strong>Next up: connect secure sign-in</strong><p>Role verification, real user data, saved placements, campaign creation and bookings must be wired to the authenticated backend before this dashboard can be used for live business.</p></div><a href="https://github.com/mrceogodwin/Adlink">View project ↗</a></div>
    <footer className="dash-footer"><span>© 2026 Adlink</span><span>Advertising, better connected.</span><a href="/">Marketplace home ↗</a></footer>
   </section>
  </main>
  {notice&&<div className="dash-toast" role="status">{notice}<button onClick={()=>setNotice('')} aria-label="Dismiss">×</button></div>}
 </div>
}
createRoot(document.getElementById('root')).render(<Dashboard/>);
