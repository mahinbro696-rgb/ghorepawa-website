'use strict';
const app=document.querySelector('#app');
const dialog=document.querySelector('#order-dialog');
const memberDialog=document.querySelector('#member-dialog');
const enNumber=new Intl.NumberFormat('en-GB');
const bdDate=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dhaka',dateStyle:'medium',timeStyle:'short'});
const money=n=>'BDT '+enNumber.format(n||0);
const number=n=>enNumber.format(n||0);
const date=s=>s&&Number.isFinite(Date.parse(s))?bdDate.format(new Date(s)):'—';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statusLabels={new:'New',assigned:'Assigned',callback:'Call Back Later',confirmed:'Confirmed',approved:'Approved for courier',unapproved:'Unapproved',dispatched:'Sent to courier',delivered:'Complete',cancelled:'Cancelled'};
const assignable=o=>typeof o.can_assign==='boolean'?o.can_assign:['new','assigned','callback','unapproved'].includes(o.status);
let user=null,members=[],orders=[],selected=new Set(),stats={},page=1,total=0,view='orders',filter={q:'',status:'',assignee:''},loadId=0;
let readController=null,teamCacheAt=0,renderedOrdersKey='',mutationBusy=0,assignmentTarget='',assignmentBusy=false;
const activeForms=new WeakSet();
const authLogo=`<div class="brand"><span class="brand-mark" aria-hidden="true">GP</span><div><strong>Ghorepawa</strong><small>OPERATIONS WORKSPACE</small></div></div>`;
let toastTimer;
function toast(message){const el=document.querySelector('#toast');el.textContent=message;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.textContent='',5500);}
async function api(path,options={}){
 const write=!!options.method&&options.method!=='GET';
 const controller=new AbortController(),parent=options.signal;
 const abort=()=>controller.abort();if(parent?.aborted)abort();else parent?.addEventListener('abort',abort,{once:true});
 const timeout=setTimeout(abort,45000);if(write)mutationBusy++;
 try{
  const response=await fetch('/api/'+path,{credentials:'same-origin',cache:'no-store',...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers},signal:controller.signal});
  let data;try{data=await response.json();}catch{throw new Error('Invalid server response. Please retry.');}
  if(!response.ok){const error=new Error(data.error||'Request failed.');error.status=response.status;
   if(response.status===401&&user){user=null;portalStop();renderLogin();}throw error;}
  if(write&&path.startsWith('team'))teamCacheAt=0;
  return data;
 }catch(e){if(parent?.aborted){const error=new Error('Cancelled');error.name='AbortError';throw error;}
  if(controller.signal.aborted)throw new Error('Request timed out. Check the result before retrying a change.');
  if(e instanceof TypeError)throw new Error('Connection failed. Check your internet and retry.');throw e;
 }finally{clearTimeout(timeout);parent?.removeEventListener('abort',abort);if(write)mutationBusy--;}
}
function bindForm(form,callback){form.addEventListener('submit',async event=>{
 event.preventDefault();if(activeForms.has(form))return;activeForms.add(form);
 const submit=form.querySelector('[type=submit]'),error=form.querySelector('.error'),label=submit.textContent;
 const values=Object.fromEntries(new FormData(form));
 const controls=[...form.querySelectorAll('input,select,textarea,button')].map(el=>[el,el.disabled]);
 controls.forEach(([el])=>{el.disabled=true;});
 if(error)error.textContent='';submit.disabled=true;submit.setAttribute('aria-busy','true');submit.textContent='Saving...';
 try{await callback(values);}
 catch(e){if(error&&form.isConnected)error.textContent=e.message;else toast(e.message);}
 finally{activeForms.delete(form);controls.forEach(([el,disabled])=>{el.disabled=disabled;});submit.removeAttribute('aria-busy');submit.textContent=label;}
});}
function renderLogin(){
 cancelAdminSearch();document.body.classList.remove('admin-mode','moderator-mode');
 portalStop();readController?.abort();loadId++;dialog.close();dialog.innerHTML='';delete dialog.dataset.orderId;memberDialog.close();memberDialog.innerHTML='';members=[];orders=[];selected.clear();teamCacheAt=0;
 const moderator=location.pathname.startsWith('/moderator');
 app.innerHTML=`<main class="auth-page"><section class="auth-card">${authLogo}<h1>${moderator?'Moderator login':'Admin login'}</h1><p class="muted small">Sign in to your account to manage orders.</p><form id="login-form"><label>Username<input name="username" value="${moderator?'':'admin'}" required autocomplete="username" spellcheck="false" autocapitalize="none" maxlength="40" placeholder="Your username"></label><label>Password<input name="password" type="password" required autocomplete="current-password" maxlength="128" placeholder="Your password"></label><button class="btn full" type="submit">Sign in</button><p class="error" role="alert"></p></form><p class="help">Contact the primary administrator for your account or password.</p><a class="auth-back" href="${moderator?'/admin':'/moderator'}">${moderator?'Admin login':'Moderator login'} →</a><a class="auth-back" href="/">Back to main website</a></section></main>`;
 bindForm(document.querySelector('#login-form'),async data=>{const result=await api('login',{method:'POST',body:JSON.stringify(data)});if(result.twoFactorRedirect){renderTwoFactor();return;}await startSession();});
}
async function startSession(){
 const data=await api('session');user=data.user;view=user.role==='admin'?'dashboard':'orders';page=1;selected.clear();filter={q:'',status:'',assignee:''};renderShell();portalStart();await loadCurrent();
}
function renderShell(){
 const admin=user.role==='admin';
 const menu=admin?[
   ['dashboard','grid','Dashboard'],['neworders','orders','New orders'],['orders','orders','All orders'],
   ['callbacks','clock','Call Back Later'],['review','check','Confirmed orders'],['completed','check','Completed orders'],
   ['unapproved','alert','Cancelled orders'],['products','box','Products'],
   ['team','users','Moderators'],['notifications','bell','Notifications'],['settings','shield','Settings & security']
 ]:[['orders','orders','My work inbox'],['allorders','box','All orders'],['workhistory','clock','My history']];
 const panel=admin?'Admin Panel':'Moderator Page';
 document.title=panel+' | Ghorepawa';document.body.classList.toggle('moderator-mode',!admin);document.body.classList.toggle('admin-mode',admin);
 app.innerHTML=`<div class="shell"><button class="nav-shade" aria-label="Close navigation"></button><aside class="sidebar">${authLogo}<div class="panel-identity">${panel}</div><div class="nav-caption">${admin?'STORE OPERATIONS':'ORDER WORKSPACE'}</div><nav class="nav-links" aria-label="Panel navigation">${menu.map(([v,i,label])=>`<button data-view="${v}">${icon(i)}<span>${label}</span></button>`).join('')}</nav><div class="sidebar-bottom">${admin?'<a href="/shop" target="_blank" rel="noopener">Product storefront &nearr;</a><a href="/" target="_blank" rel="noopener">Main website &nearr;</a>':'<p>Work on your assigned inbox. All orders is a read-only list. History contains submission receipts.</p>'}<span class="workspace-label">Bangladesh time (UTC+6)<br>Ghorepawa &middot; Glass Workflow v3</span></div></aside><div class="workspace"><header class="topbar"><div class="topbar-title"><button class="btn secondary icon-only mobile-menu" id="menu-toggle" aria-label="Open navigation" aria-expanded="false">${icon('menu')}</button><span class="workspace-title"><strong>${panel}</strong><span id="breadcrumb">${admin?'Dashboard':'My work inbox'}</span></span><span id="connection" class="connection">Connecting</span></div><div class="top-actions"><button id="sound-toggle" class="btn secondary icon-only" aria-label="Enable notification sound" aria-pressed="false">${icon('volume')}</button>${admin?`<button id="open-notices" class="btn secondary icon-only" aria-label="Open notifications">${icon('bell')}<span class="count-dot" id="notice-count" hidden></span></button>`:''}<div class="user-chip"><div class="avatar" aria-hidden="true">${esc(user.name.slice(0,1))}</div><div class="user-name"><strong>${esc(user.name)}</strong><span>${admin?'Administrator':'Moderator'}</span></div></div><button class="btn secondary" id="logout">Log out</button></div></header><div id="updates-banner" class="updates-banner" hidden><span>New work is available. Refresh to load it.</span><button id="load-updates" class="btn secondary">Refresh</button></div><main id="content" class="content" tabindex="-1"></main></div></div>`;
 document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{closeMobileMenu();navigate(b.dataset.view);});
 document.querySelector('#menu-toggle').onclick=()=>{const open=document.body.classList.toggle('mobile-nav-open');document.querySelector('#menu-toggle').setAttribute('aria-expanded',String(open));};
 document.querySelector('.nav-shade').onclick=closeMobileMenu;
 const notices=document.querySelector('#open-notices');if(notices)notices.onclick=()=>navigate('notifications');
 document.querySelector('#sound-toggle').onclick=toggleSound;
 document.querySelector('#load-updates').onclick=()=>{if(!uiBusy())loadCurrent();else toast('Finish the current form before refreshing.');};
 document.querySelector('#logout').onclick=async e=>{e.currentTarget.disabled=true;try{await api('session',{method:'POST',body:JSON.stringify({action:'logout'})});user=null;portalStop();renderLogin();}catch(err){toast(err.message);if(user)document.querySelector('#logout').disabled=false;}};
}
async function navigate(next){
 if(!user)return;
 if(mutationBusy||assignmentBusy){toast('Finish the current update before changing pages.');return;}
 const allowed=user.role==='admin'?['dashboard','neworders','orders','callbacks','review','completed','unapproved','products','team','notifications','settings']:['orders','allorders','workhistory'];
 if(!allowed.includes(next)){toast('This page is not available for your role.');return;}
 cancelAdminSearch();detailTicket++;dialog.close();dialog.innerHTML='';delete dialog.dataset.orderId;
 view=next;page=1;selected.clear();assignmentTarget='';orders=[];filter={q:'',status:'',assignee:''};await loadCurrent();
}
async function loadCurrent({background=false,search=false}={}){
 if(!user||(background&&uiBusy()))return;
 if(!search&&!background)cancelAdminSearch();
 readController?.abort();readController=new AbortController();const signal=readController.signal;
 const id=++loadId,currentView=view,content=document.querySelector('#content');
 document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-current',b.dataset.view===view?'page':'false');});
 const label=document.querySelector(`[data-view="${view}"] span`);document.querySelector('#breadcrumb').textContent=label?.textContent||'Workspace';
 content.classList.add('is-loading');content.setAttribute('aria-busy','true');
 if(content.dataset.currentView!==view){content.dataset.currentView=view;content.innerHTML='<div class="skeleton-grid" aria-label="Loading"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>';renderedOrdersKey='';}
 try{
  if(['dashboard','products','notifications'].includes(view)){await renderExtraView(view,id,signal);return;}
  if(view==='workhistory'){await renderWorkHistory(id,signal);return;}
  if(view==='settings'){if(user.role==='admin')await renderSettings();return;}
  if(view==='team'){const data=await api('team',{signal});if(id!==loadId||!user)return;members=data.members;teamCacheAt=0;renderTeam();return;}
  const params=new URLSearchParams({...filter,page,section:view==='callbacks'?'callbacks':view==='review'?'confirmed':view==='unapproved'?'cancelled':view==='completed'?'completed':''});
  // The new-work queue is a server-filtered view, never a separate copy of an order.
  if(currentView==='neworders'){params.set('status','new');params.set('assignee','unassigned');}
  if(currentView==='allorders'&&user.role==='moderator')params.set('scope','all');
  // Only network responses renew the team cache; cache reads must not extend its TTL.
  const refreshTeam=user.role==='admin'&&Date.now()-teamCacheAt>=60000;
  const people=user.role==='admin'?(refreshTeam?api('team?compact=1',{signal}):Promise.resolve({members})):Promise.resolve(null);
  const [result,team]=await Promise.all([api('orders?'+params,{signal}),people]);
  if(id!==loadId||!user||(background&&uiBusy()))return;
  // Assigning the last rows on a later page must reveal the remaining queue, not a false empty page.
  if(currentView==='neworders'){
   const lastPage=Math.max(1,Math.ceil(result.total/30));
   if(page>lastPage){page=lastPage;selected.clear();return await loadCurrent({background,search});}
  }
  const key=JSON.stringify([currentView,params.toString(),result,team]);
  orders=result.orders;total=result.total;stats=result.stats;if(team){members=team.members;if(refreshTeam)teamCacheAt=Date.now();}
  if(!background||key!==renderedOrdersKey){const current=new Set(orders.filter(assignable).map(o=>o.id));selected=new Set([...selected].filter(x=>current.has(x)));renderOrders({preserveSearch:search});renderedOrdersKey=key;}
  document.querySelector('#updates-banner').hidden=true;
 }catch(e){if(e.name==='AbortError')return;if(id===loadId&&user){
   if(background){setConnection(false);return;}
   if(search&&content.querySelector('#filter-form')){showAdminSearchError(e.message);return;}
   content.innerHTML=`<div class="notice" role="alert">${esc(e.message)}</div><button class="btn secondary" id="retry">Retry</button>`;document.querySelector('#retry').onclick=()=>loadCurrent();
 }}finally{if(id===loadId&&content.isConnected){if(search)searchBusy(false);content.classList.remove('is-loading');content.setAttribute('aria-busy','false');}}
}
function badge(status){return `<span class="badge ${esc(status)}">${esc(statusLabels[status]||status)}</span>`;}
// Compact rows are admin-only. Full details remain in the existing order dialog.
const orderDay=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dhaka',day:'numeric',month:'short',year:'numeric'});
const orderTime=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dhaka',hour:'numeric',minute:'2-digit'});
function adminOrderTime(value){
 if(!value||!Number.isFinite(Date.parse(value)))return '<span class="cell-meta">&mdash;</span>';
 const d=new Date(value);
 return `<time class="cell-meta" datetime="${esc(d.toISOString())}" title="${esc(date(value))}">${esc(orderDay.format(d))}<span class="order-time">${esc(orderTime.format(d))}</span></time>`;
}
function renderAdminOrderRow(o){
 const id=esc(o.id),ref=esc(o.reference),product=esc(o.product_name||'Ever Strong');
 const trash='<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7"/></svg>';
 return `<tr class="state-${esc(o.status)}" data-record-id="${id}">
  <td class="order-check"><label class="check-target"><input type="checkbox" data-select="${id}" aria-label="Select ES-${ref}" ${selected.has(o.id)?'checked':''} ${!assignable(o)?'disabled':''}></label></td>
  <td class="order-reference"><strong class="ref">${highlightOrderMatch('ES-'+o.reference)}</strong>${adminOrderTime(o.created_at)}</td>
  <td class="order-customer"><strong class="cell-title" title="${esc(o.customer_name)}">${highlightOrderMatch(o.customer_name)}</strong><a class="phone-text" href="tel:+88${esc(o.phone)}">${highlightOrderMatch(o.phone)}</a>${o.phone_orders>1?`<span class="duplicate">${number(o.phone_orders)} orders on this phone</span>`:''}</td>
  <td class="order-location"><span class="cell-title" title="${esc(o.district)}">${highlightOrderMatch(o.district)}</span><small class="cell-meta" title="${esc(o.area)}">${highlightOrderMatch(o.area)}</small>${filter.q?`<small class="search-address" title="${esc(o.address)}">${highlightOrderMatch(o.address)}</small>`:''}${o.latest_note?`<p class="call-note" title="${esc(o.latest_note)}">${esc(o.latest_note)}</p>`:''}</td>
  <td class="order-product"><span class="cell-title" title="${product}">${highlightOrderMatch(o.product_name||'Ever Strong')}</span><div class="order-price-line"><strong>${money(o.total)}</strong><span class="quantity-tag">Qty ${number(o.quantity)}</span></div></td>
  <td class="order-status">${badge(o.status)}${callbackTag(o)}${o.callback_at?`<small class="cell-meta">Call: ${date(o.callback_at)}</small>`:''}</td>
  <td class="order-moderator">${o.assigned_to?staffChip(o.assigned_name,o.assigned_badge):'<span class="admin-custody">With admin</span>'}${o.confirmed_by?`<small class="cell-meta">Confirmed by</small>${staffChip(o.confirmed_name,o.confirmed_badge)}`:''}</td>
  <td class="order-actions"><div class="order-row-actions"><button type="button" class="row-open" data-open="${id}" aria-label="Open order ES-${ref}">Open</button><button type="button" class="delete-order-link" data-delete-order="${id}" aria-label="Permanently delete order ES-${ref}" title="Delete ES-${ref}">${trash}</button></div></td>
 </tr>`;
}
function renderOrders({preserveSearch=false}={}){
 if(user.role!=='admin'){if(view==='allorders')renderModeratorAllOrders();else renderModeratorInbox();return;}
 const newQueue=view==='neworders';
 const count=Object.values(stats).reduce((a,b)=>a+b,0);
 const title=newQueue?'New orders':view==='review'?'Confirmed orders':view==='completed'?'Completed orders':view==='unapproved'?'Cancelled orders':view==='callbacks'?'Call Back Later':'All orders';
 const subtitle=newQueue?`${number(total)} matching new orders awaiting assignment. Assigned orders leave this queue but stay in All orders.`:view==='review'?'Confirmed orders awaiting fulfilment. Choose Complete when delivered, or Cancel with a reason.':view==='completed'?'Completed orders. Confirmation alone does not mark an order Complete.':view==='unapproved'?'Cancelled orders and their cancellation reasons. These are separate from completed orders.':view==='callbacks'?'All callback customers and their notes. Reassign without losing the Call Back Later status.':'Assign work, review call results and manage fulfilment.';
 const cards=[['','All orders',count],['new','New',stats.new||0],['callback','Call back later',stats.callback||0],['confirmed','Confirmed',stats.confirmed||0],['delivered','Complete',stats.delivered||0],['cancelled','Cancelled',stats.cancelled||0]];
 const people=members.filter(m=>m.role==='moderator'&&m.status==='active');
 const statusOptions=newQueue?['new']:view==='callbacks'?['callback']:view==='unapproved'?['cancelled']:view==='completed'?['delivered']:view==='review'?['confirmed','approved','dispatched']:Object.keys(statusLabels);
 const target=document.querySelector('#content');
 const heldForm=preserveSearch?target.querySelector('#filter-form'):null;
 const focused=heldForm?.contains(document.activeElement)?document.activeElement:null;
 const caret=focused?.name==='q'?[focused.selectionStart,focused.selectionEnd]:null;
 const emptyMessage=newQueue
  ?`<strong>${filter.q.trim()?'No matching new orders':'No new orders waiting'}</strong>${filter.q.trim()?'Clear search to see other waiting orders.':'Assigned orders remain in All orders. New incoming orders will appear here.'}`
  :'<strong>No orders in this list</strong>New orders or changed filters will appear here.';
 target.innerHTML=`<div class="page-heading"><div><div class="eyebrow">ADMIN PANEL / ORDER MANAGEMENT</div><h1>${title}</h1><p>${subtitle}</p></div><button id="refresh" class="btn secondary">Refresh</button></div>${view==='orders'?`<div class="stats">${cards.map(([s,label,n])=>`<button class="stat ${filter.status===s?'active':''}" data-stat="${s}"><span>${label}</span><b>${number(n)}</b></button>`).join('')}</div>`:''}<div class="status-legend" aria-label="Order colors"><span class="legend-complete">Complete</span><span class="legend-callback">Call Back Later</span><span class="legend-confirmed">Confirmed</span><span class="legend-cancelled">Cancelled</span></div><section class="panel" aria-label="Order list"><form id="filter-form" class="filters"><label class="order-search-label">Search orders<span class="order-search-control"><input name="q" value="${esc(filter.q)}" placeholder="Name, phone, address or ES-5" autocomplete="off" maxlength="100" aria-describedby="order-search-help"><button id="clear-search" class="search-clear" type="button" aria-label="Clear search" ${filter.q?'':'hidden'}>&times;</button></span><small id="order-search-help">Partial matches across all pages in this section.</small></label><label>Status<select name="status" ${newQueue?'disabled aria-label="New orders only"':''}>${newQueue?'':'<option value="">All in this section</option>'}${statusOptions.map(k=>`<option value="${k}" ${(newQueue||filter.status===k)?'selected':''}>${esc(statusLabels[k])}</option>`).join('')}</select></label><label>Assigned moderator<select name="assignee" ${newQueue?'disabled aria-label="Unassigned orders only"':''}>${newQueue?'<option value="unassigned">With admin / unassigned</option>':`<option value="">All moderators</option><option value="unassigned" ${filter.assignee==='unassigned'?'selected':''}>With admin / unassigned</option>${members.filter(m=>m.role==='moderator').map(m=>`<option value="${esc(m.id)}" ${filter.assignee===m.id?'selected':''}>${staffOption(m)}</option>`).join('')}`}</select></label><button class="btn" type="submit">Search</button></form>${searchSummary()}<div class="bulk-bar"><span class="selection-count" id="selected-count">${number(selected.size)} selected</span><label for="bulk-assignee">Assign to</label><select id="bulk-assignee" aria-label="Moderator for assignment"><option value="">Choose moderator</option>${people.map(m=>`<option value="${esc(m.id)}" ${m.id===assignmentTarget?'selected':''}>${staffOption(m)}</option>`).join('')}</select><button id="assign" class="btn" ${!selected.size?'disabled':''}>Assign selected</button><span id="assignee-chip"></span><p class="bulk-help">${people.length?'Select New, Assigned, Call Back Later or Unapproved orders, then choose an active moderator.':'No active moderators. Open Moderators and approve an account first.'}</p><p id="assignment-error" class="error" role="alert"></p></div><div class="table-scroll"><table class="work-table"><colgroup><col class="col-check"><col class="col-reference"><col class="col-customer"><col class="col-location"><col class="col-product"><col class="col-status"><col class="col-moderator"><col class="col-actions"></colgroup><thead><tr><th scope="col" class="order-check"><label class="check-target"><input type="checkbox" id="select-all" aria-label="Select all assignable orders on this page"></label></th><th scope="col">Order</th><th scope="col">Customer</th><th scope="col">Location / note</th><th scope="col">Product / total</th><th scope="col">Status</th><th scope="col">Assigned to</th><th scope="col">Actions</th></tr></thead><tbody>${orders.length?orders.map(renderAdminOrderRow).join(''):`<tr><td colspan="8"><div class="empty" role="status">${emptyMessage}</div></td></tr>`}</tbody></table></div><div class="pagination"><span>${number(total)} orders &middot; page ${number(page)} / ${number(Math.max(1,Math.ceil(total/30)))}</span><div><button id="prev" class="btn secondary" ${page<=1?'disabled':''}>Previous</button><button id="next" class="btn secondary" ${page*30>=total?'disabled':''}>Next</button></div></div></section>`;
 if(heldForm)target.querySelector('#filter-form').replaceWith(heldForm);
 addOrderToolbar();
 target.querySelector('#refresh').onclick=()=>{selected.clear();loadCurrent();};
 target.querySelectorAll('[data-stat]').forEach(b=>b.onclick=()=>{filter.status=b.dataset.stat;page=1;selected.clear();loadCurrent();});
 bindAdminSearch(target);
 bindOrderPaging(target);
 target.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openOrder(orders.find(o=>o.id===b.dataset.open)));
 target.querySelectorAll('[data-delete-order]').forEach(b=>b.onclick=()=>confirmOrderDelete(orders.find(o=>o.id===b.dataset.deleteOrder)));
 target.querySelectorAll('[data-select]').forEach(c=>c.onchange=()=>{c.checked?selected.add(c.dataset.select):selected.delete(c.dataset.select);syncSelection();});
 target.querySelector('#select-all').onchange=e=>{orders.filter(assignable).forEach(o=>e.target.checked?selected.add(o.id):selected.delete(o.id));syncSelection();};
 target.querySelector('#bulk-assignee').onchange=e=>{assignmentTarget=e.target.value;const m=members.find(m=>m.id===e.target.value);target.querySelector('#assignee-chip').innerHTML=m?staffChip(m.name,m.badge_number):'';syncSelection();};
 target.querySelector('#assign').onclick=async e=>{
  const b=e.currentTarget,assignee=target.querySelector('#bulk-assignee').value,error=target.querySelector('#assignment-error');
  if(assignmentBusy)return;
  if(!assignee||!selected.size){error.textContent='Select orders and an active moderator.';return;}
  const chosen=orders.filter(o=>selected.has(o.id)&&assignable(o));
  if(chosen.length!==selected.size){error.textContent='The selection changed. Refresh and select the orders again.';return;}
  assignmentBusy=true;readController?.abort();loadId++;error.textContent='';b.textContent='Assigning...';syncSelection();
  const ids=chosen.map(o=>o.id);
  try{
   await api('orders',{method:'PATCH',body:JSON.stringify({action:'assign',ids,assignee,versions:Object.fromEntries(chosen.map(o=>[o.id,o.version]))})});
   selected.clear();toast(`${number(ids.length)} orders assigned successfully.`);await loadCurrent();
  }catch(err){if(error.isConnected)error.textContent=err.message;toast(err.message);}
  finally{assignmentBusy=false;if(b.isConnected)b.textContent='Assign selected';syncSelection();}
 };syncSelection();
 if(focused?.isConnected){const glow=adminSearchGlow;focused.focus({preventScroll:true});if(caret)focused.setSelectionRange(...caret);adminSearchGlow=glow;}
 syncSearchGlow();
}
function syncSelection(){
 document.querySelectorAll('[data-select]').forEach(c=>{c.checked=selected.has(c.dataset.select);c.closest('tr')?.classList.toggle('is-selected',c.checked);});
 const eligible=orders.filter(assignable),all=document.querySelector('#select-all');if(!all)return;
 all.checked=eligible.length>0&&eligible.every(o=>selected.has(o.id));all.indeterminate=selected.size>0&&!all.checked;
 document.querySelector('#selected-count').textContent=number(selected.size)+' selected';document.querySelector('#assign').disabled=!selected.size||!document.querySelector('#bulk-assignee')?.value||mutationBusy>0||assignmentBusy;
 document.querySelectorAll('[data-select],#select-all,#bulk-assignee').forEach(c=>{if(c.id==='bulk-assignee'||c.id==='select-all')c.disabled=assignmentBusy;else c.disabled=assignmentBusy||!assignable(orders.find(o=>o.id===c.dataset.select)||{});});
}
function nextStatuses(order){
 if(user.role==='moderator')return order.can_update!==false&&view!=='allorders'&&['assigned','callback'].includes(order.status)?['confirmed','callback','cancelled']:[];
 return Array.isArray(order.allowed_statuses)?order.allowed_statuses:[];
}
let detailTicket=0;
async function openOrder(order){
 if(!order||!user)return;
 const ticket=++detailTicket,memberId=user.id;
 try{const result=await api('orders?id='+encodeURIComponent(order.id)+(user.role==='moderator'&&view==='allorders'?'&scope=all':''));
  if(ticket!==detailTicket||user?.id!==memberId)return;
  if(!result.orders.length){forgetOrder(order.id);toast('This order was removed or returned to admin.');await loadCurrent();return;}
  showOrderDetails(result.orders[0]);
 }catch(e){toast(e.message);}
}
function showOrderDetails(order){
 const admin=user.role==='admin',canNote=admin||(view!=='allorders'&&order.can_update!==false&&['assigned','callback'].includes(order.status)),choices=nextStatuses(order);
 dialog.innerHTML=`<div class="dialog-head"><div><div class="eyebrow">${admin?'ADMIN PANEL':'MODERATOR PAGE'}</div><h2 id="order-title">Order ES-${esc(order.reference)}</h2>${badge(order.status)}${callbackTag(order)}</div><button class="close" data-close aria-label="Close">&times;</button></div><div class="dialog-body"><div class="order-detail-grid"><div><span class="detail-label">Customer</span><strong class="detail-value">${esc(order.customer_name)}</strong></div><div><span class="detail-label">Received</span><span class="detail-value">${date(order.created_at)}</span></div><div class="wide"><span class="detail-label">Call customer</span><a class="call-link" href="tel:+88${esc(order.phone)}">${esc(order.phone)}</a></div><div class="wide"><span class="detail-label">Address</span><span class="detail-value">${esc(order.address)}, ${esc(order.area)}, ${esc(order.district)}</span></div><div><span class="detail-label">Product / quantity</span><span class="detail-value">${esc(order.product_name||'Ever Strong')} &times; ${number(order.quantity)}</span></div>${admin?`<div><span class="detail-label">Total</span><strong class="detail-value">${money(order.total)}</strong></div><div><span class="detail-label">Assigned to</span>${order.assigned_to?staffChip(order.assigned_name,order.assigned_badge):'<strong>With admin</strong>'}</div>${order.confirmed_by?`<div><span class="detail-label">Confirmed by moderator</span>${staffChip(order.confirmed_name,order.confirmed_badge)}</div>`:''}`:''}${order.callback_at?`<div><span class="detail-label">Call Back Later</span><span class="detail-value">${date(order.callback_at)}</span></div>`:''}${order.latest_note?`<div class="wide"><span class="detail-label">Call note</span><span class="detail-value">${esc(order.latest_note)}</span></div>`:''}</div>${canNote?`<section class="detail-actions"><h3>${admin?'Update fulfilment':'Call result & handoff'}</h3><form id="order-update">${admin?`<div class="status-action-buttons" aria-label="Choose order outcome">${[['confirmed','Confirm order'],['delivered','Complete order'],['cancelled','Cancel order']].filter(([v])=>choices.includes(v)).map(([v,l])=>`<button type="button" class="btn secondary outcome-${v}" data-status-choice="${v}" aria-pressed="false">${l}</button>`).join('')}</div>`:''}<label>Result<select name="status" ${admin?'':'required'}><option value="">${admin?'Save note only':'Choose call result'}</option>${choices.map(s=>`<option value="${s}">${s==='delivered'?'Complete - delivery finished':s==='dispatched'?'Send to courier':esc(statusLabels[s])}</option>`).join('')}</select></label><label id="callback-field" hidden>Call again (Bangladesh time)<input name="callbackAt" type="datetime-local"></label><label>Note / reason<textarea name="note" maxlength="1500" placeholder="No answer, requested another time, confirmed details..."></textarea></label><p class="help">${admin?'Confirm, Complete and Cancel are different actions. Only Complete marks an order green.':'Submit removes the order and customer details from your inbox. Only the order reference, result and time remain in your history.'} A note is required for callback or cancellation.</p><div class="form-actions"><button class="btn" type="submit">${admin?'Save update':'Submit to admin'}</button><button class="btn secondary" type="button" data-close>Close</button></div><p class="error" role="alert"></p></form></section>`:''}${!canNote?'<p class="readonly-notice">Read-only order. Changes can only be made from your assigned work inbox.</p>':''}${admin&&assignable(order)?`<section class="detail-assignment"><h3>Assign this order</h3><form id="detail-assign-form"><label>Active moderator<select name="assignee" required><option value="">Choose moderator</option>${members.filter(m=>m.role==='moderator'&&m.status==='active').map(m=>`<option value="${esc(m.id)}">${staffOption(m)}</option>`).join('')}</select></label><button class="btn" type="submit">Assign order</button><p class="error" role="alert"></p></form></section>`:''}${admin?`<section class="history"><h3>Order history</h3><div id="history-content" role="status">Loading...</div></section><section class="danger-zone"><h3>Permanent deletion</h3><p>Remove this order and its customer information from the application.</p><button class="btn danger" id="delete-from-detail">Delete this order</button></section>`:''}</div>`;
 dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{dialog.close();dialog.innerHTML='';delete dialog.dataset.orderId;});
 dialog.dataset.orderId=order.id;dialog.dataset.readOnly=String(!admin&&view==='allorders');dialog.dataset.orderVersion=String(order.version);if(!dialog.open)dialog.showModal();
 if(canNote){const form=dialog.querySelector('#order-update');form.elements.status.onchange=()=>{
   const value=form.elements.status.value,callback=value==='callback';
   form.querySelectorAll('[data-status-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.statusChoice===value)));
   if(admin)form.querySelector('[type=submit]').textContent=({confirmed:'Confirm order',delivered:'Complete order',cancelled:'Cancel order'})[value]||'Save update';dialog.querySelector('#callback-field').hidden=!callback;
   form.elements.callbackAt.required=callback;form.elements.note.required=['callback','cancelled','unapproved'].includes(value);
   if(callback&&!form.elements.callbackAt.value)form.elements.callbackAt.value=new Date(Date.now()+7*3600000).toISOString().slice(0,16);
  };
  form.querySelectorAll('[data-status-choice]').forEach(b=>b.onclick=()=>{form.elements.status.value=b.dataset.statusChoice;form.elements.status.onchange();if(b.dataset.statusChoice==='cancelled')form.elements.note.focus();});
  bindForm(form,async data=>{let callbackAt=null;if(data.status==='callback'&&data.callbackAt)callbackAt=new Date(data.callbackAt+'+06:00').toISOString();
   const result=await api('orders',{method:'PATCH',body:JSON.stringify({action:data.status?'status':'note',id:order.id,version:order.version,status:data.status,note:data.note,callbackAt})});
   dialog.close();dialog.innerHTML='';delete dialog.dataset.orderId;if(!admin)forgetOrder(order.id);
   toast(result.returnedToAdmin?'Submitted to admin. A minimal receipt is in My history.':'Order updated.');await loadCurrent();
  });
 }
 if(admin){
  const assignment=dialog.querySelector('#detail-assign-form');if(assignment)bindForm(assignment,async data=>{
   await api('orders',{method:'PATCH',body:JSON.stringify({action:'assign',ids:[order.id],assignee:data.assignee,versions:{[order.id]:order.version}})});
   dialog.close();toast('Order assigned successfully.');selected.clear();await loadCurrent();
  });
  dialog.querySelector('#delete-from-detail').onclick=()=>confirmOrderDelete(order);
  api('history?id='+order.id).then(result=>{if(!dialog.open||dialog.dataset.orderId!==order.id||!dialog.querySelector('#history-content'))return;
   dialog.querySelector('#history-content').innerHTML=result.events.map(e=>`<div class="history-item"><strong>${e.kind==='created'?'Order received':e.kind==='assigned'?'Assigned to moderator':e.kind==='note'?'Note saved':`${esc(statusLabels[e.from_status]||'')} &rarr; ${esc(statusLabels[e.to_status]||'')}`}</strong><small>${esc(e.actor_name||'Website')} &middot; ${date(e.created_at)}</small>${e.note?`<p>${esc(e.note)}</p>`:''}</div>`).join('');
  }).catch(e=>{const h=dialog.querySelector('#history-content');if(h)h.textContent=e.message;});
 }
}
function renderTeam(){document.querySelector('#content').innerHTML=`<div class="page-heading"><div><h1>Moderator management</h1><p>Manage staff accounts, approvals and work progress.</p></div><button class="btn" id="new-member">+ Add moderator</button></div><div class="notice">After creating a moderator, select Approve account to allow them to sign in and work.</div><div class="team-grid">${members.map(m=>`<article class="member-card"><div class="member-header"><div>${m.role==='moderator'?staffChip(m.name,m.badge_number):'<h3>'+esc(m.name)+'</h3>'}<span class="muted small">@${esc(m.username)}</span></div><span class="badge ${m.status==='active'?'approved':m.status==='pending'?'callback':'unapproved'}">${m.role==='admin'?'Primary administrator':m.status==='active'?'Active':m.status==='pending'?'Pending approval':'Disabled'}</span></div><div class="member-numbers"><div><b>${number(m.total_orders)}</b><span>Assigned</span></div><div><b>${number(m.confirmed_orders)}</b><span>Confirmed</span></div><div><b>${number(m.pending_orders)}</b><span>Pending</span></div></div>${m.role==='moderator'?`<div class="member-actions"><button class="btn ${m.status==='active'?'danger':''}" data-member-status="${esc(m.id)}" data-status="${m.status==='active'?'disabled':'active'}">${m.status==='active'?'Disable account':m.status==='pending'?'Approve account':'Reactivate account'}</button><button class="btn secondary" data-reset="${esc(m.id)}">Change password</button></div>`:'<p class="help">Full access to orders and staff management</p>'}</article>`).join('')}</div>`;
 document.querySelector('#new-member').onclick=()=>openMember();document.querySelectorAll('[data-reset]').forEach(b=>b.onclick=()=>openMember(members.find(m=>m.id===b.dataset.reset)));
 document.querySelectorAll('[data-member-status]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await api('team',{method:'PATCH',body:JSON.stringify({id:b.dataset.memberStatus,status:b.dataset.status})});toast('Account status updated.');await loadCurrent();}catch(e){toast(e.message);b.disabled=false;}});
}
function openMember(member){memberDialog.innerHTML=`<div class="dialog-head"><h2 id="member-title">${member?'Change password':'New moderator'}</h2><button class="close" aria-label="Close">×</button></div><div class="dialog-body"><form id="member-form" class="form-stack">${member?`<p>${esc(member.name)} · @${esc(member.username)}</p>`:'<label>Moderator name<input name="name" required minlength="2" maxlength="100" autocomplete="off"></label><label>Username<input name="username" required minlength="3" maxlength="40" autocomplete="off" autocapitalize="none"><p class="help">English letters and numbers, for example moderator1</p></label>'}<label>${member?'New password':'Initial password'}<input name="password" type="password" required minlength="12" maxlength="128" autocomplete="new-password"><p class="help">At least 12 characters. Share login details privately with the member.</p></label><button class="btn" type="submit">${member?'Change password':'Create account'}</button><p class="error" role="alert"></p></form></div>`;memberDialog.querySelector('.close').onclick=()=>memberDialog.close();memberDialog.showModal();bindForm(memberDialog.querySelector('form'),async data=>{await api('team',{method:member?'PATCH':'POST',body:JSON.stringify(member?{action:'password',id:member.id,password:data.password}:data)});memberDialog.close();toast(member?'Password updated. Previous sessions have been revoked.':'Moderator created. Approve the account to enable access.');await loadCurrent();});}
async function renderSettings(){if(user?.role!=='admin')return;document.querySelector('#content').innerHTML=`<div class="page-heading"><div><h1>Account security</h1><p>Change your login password and manage account security.</p></div></div><section class="panel settings-card"><form id="password-form" class="form-stack"><label>Current password<input name="currentPassword" type="password" required autocomplete="current-password"></label><label>New password<input name="newPassword" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></label><label>Confirm new password<input name="confirm" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></label><button class="btn" type="submit">Change password</button><p class="error" role="alert"></p></form></section>`;bindForm(document.querySelector('#password-form'),async data=>{if(data.newPassword!==data.confirm)throw new Error('The new passwords do not match.');await api('session',{method:'POST',body:JSON.stringify({action:'password',...data})});toast('Password changed.');await renderSettings();});await renderSecurity();addNotificationSettings();}

function renderTwoFactor(recovery=false){
 app.innerHTML=`<main class="auth-page"><section class="auth-card">${authLogo}<h1>${recovery?'Recovery code':'Two-factor authentication'}</h1><p>${recovery?'Enter an unused recovery code you saved earlier.':'Enter the 6-digit code from Google Authenticator.'}</p><form id="two-factor-login"><label>${recovery?'Recovery code':'Authenticator code'}<input name="code" required autocomplete="one-time-code" ${recovery?'':'inputmode="numeric" pattern="[0-9]{6}" maxlength="6"'}></label><button class="btn full" type="submit">Verify and sign in</button><p class="error" role="alert"></p></form><button class="btn secondary" id="recovery-toggle">${recovery?'Use Authenticator':'No access to your phone? Use a recovery code'}</button><button class="auth-back" id="back-login">Back to sign in</button></section></main>`;
 document.querySelector('#recovery-toggle').onclick=()=>renderTwoFactor(!recovery);
 document.querySelector('#back-login').onclick=renderLogin;
 bindForm(document.querySelector('#two-factor-login'),async data=>{await api('security',{method:'POST',body:JSON.stringify({action:recovery?'recover':'verify',code:data.code})});await startSession();});
}
async function renderSecurity(){
 const target=document.querySelector('#content');
 const section=document.createElement('section');section.className='panel settings-card security-card';target.append(section);
 try{const data=await api('security');if(!section.isConnected)return;
 section.innerHTML=`<h2>Google Authenticator</h2><p class="badge ${data.enabled?'approved':'callback'}">${data.enabled?'Two-factor authentication is enabled':'Two-factor authentication is not enabled'}</p><p class="help">Protect your account with a code from your phone as well as your password.</p><form id="security-form" class="form-stack"><label>Current password<input name="password" type="password" required autocomplete="current-password"></label>${data.enabled?'<label>Authenticator code or unused recovery code<input name="code" required maxlength="100" autocomplete="one-time-code"></label>':''}<button class="btn ${data.enabled?'danger':''}" type="submit">${data.enabled?'Disable two-factor authentication':'Connect Authenticator'}</button><p class="error" role="alert"></p></form>`;
 bindForm(section.querySelector('form'),async values=>{
  const result=await api('security',{method:'POST',body:JSON.stringify({...values,action:data.enabled?'disable':'enable'})});
  if(data.enabled){toast('Two-factor authentication disabled.');await renderSettings();return;}
  section.innerHTML=`<h2>Connect Authenticator</h2><ol><li>Open Google Authenticator, tap + and scan this QR code.</li><li>On the same phone, choose Enter a setup key and use the key below. Select Time based.</li><li>Save your recovery codes securely, then enter the code from the app to confirm.</li></ol><img class="auth-qr" src="${esc(result.qr)}" width="240" height="240" alt="Authenticator setup QR"><label>Setup key<input readonly value="${esc(result.secret)}" aria-label="Authenticator setup key"></label><h3>One-time recovery codes</h3><p class="help">You will need these if you lose your phone. Do not share them.</p><pre class="backup-codes">${esc(result.backupCodes.join('\n'))}</pre><button class="btn secondary" id="save-codes">Download recovery codes</button><form id="verify-enrollment" class="form-stack"><label>6-digit Authenticator code<input name="code" required inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code"></label><button class="btn" type="submit">Verify and enable two-factor authentication</button><p class="error" role="alert"></p></form>`;
  section.querySelector('#save-codes').onclick=()=>{const url=URL.createObjectURL(new Blob(['Ever Strong recovery codes\n'+result.backupCodes.join('\n')],{type:'text/plain'}));const a=document.createElement('a');a.href=url;a.download='ever-strong-recovery-codes.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  bindForm(section.querySelector('form'),async values=>{await api('security',{method:'POST',body:JSON.stringify({action:'verify',code:values.code})});toast('Authenticator connected. Two-factor authentication is enabled.');await renderSettings();});
 });
 }catch(e){section.textContent=e.message;}
 if(user?.role==='admin'&&target.isConnected&&section.isConnected&&view==='settings'){const backup=document.createElement('section');backup.className='panel settings-card security-card';backup.innerHTML='<h2>Business data export</h2><p>Download orders, team members and work history as JSON. Passwords and Authenticator secrets are not included.</p><a class="btn" href="/api/export" download>Download business data</a><p class="help">This file contains customer information. Store it securely. Admin can erase individual orders after explicit confirmation. Existing downloads are not erased.</p>';target.append(backup);}
}

// Polling is coordinated by portal.js; no overlapping interval rerenders.
