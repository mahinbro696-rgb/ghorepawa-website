'use strict';
const app=document.querySelector('#app');
const dialog=document.querySelector('#order-dialog');
const memberDialog=document.querySelector('#member-dialog');
const bnNumber=new Intl.NumberFormat('bn-BD');
const bdDate=new Intl.DateTimeFormat('bn-BD',{timeZone:'Asia/Dhaka',dateStyle:'medium',timeStyle:'short'});
const money=n=>'৳'+bnNumber.format(n||0);
const number=n=>bnNumber.format(n||0);
const date=s=>s&&Number.isFinite(Date.parse(s))?bdDate.format(new Date(s)):'—';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statusLabels={new:'New',assigned:'Assigned',callback:'Call Back Later',confirmed:'Moderator confirmed',approved:'Approved for courier',unapproved:'Unapproved',dispatched:'Sent to courier',delivered:'Complete',cancelled:'Cancelled'};
const assignable=o=>['new','assigned','callback','unapproved'].includes(o.status);
let user=null,members=[],orders=[],selected=new Set(),stats={},page=1,total=0,view='orders',filter={q:'',status:'',assignee:''},loadId=0;
let readController=null,teamCacheAt=0,renderedOrdersKey='',mutationBusy=0;
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
 if(error)error.textContent='';submit.disabled=true;submit.setAttribute('aria-busy','true');submit.textContent='Saving...';
 try{await callback(Object.fromEntries(new FormData(form)));}
 catch(e){if(error&&form.isConnected)error.textContent=e.message;else toast(e.message);}
 finally{activeForms.delete(form);submit.disabled=false;submit.removeAttribute('aria-busy');submit.textContent=label;}
});}
function renderLogin(){
 portalStop();readController?.abort();loadId++;dialog.close();dialog.innerHTML='';delete dialog.dataset.orderId;memberDialog.close();memberDialog.innerHTML='';members=[];orders=[];selected.clear();teamCacheAt=0;
 const moderator=location.pathname.startsWith('/moderator');
 app.innerHTML=`<main class="auth-page"><section class="auth-card">${authLogo}<h1>${moderator?'মডারেটর লগইন':'অ্যাডমিন লগইন'}</h1><p class="muted small">অর্ডার পরিচালনা করতে আপনার অ্যাকাউন্টে প্রবেশ করুন।</p><form id="login-form"><label>ইউজার আইডি<input name="username" value="${moderator?'':'admin'}" required autocomplete="username" spellcheck="false" autocapitalize="none" maxlength="40" placeholder="আপনার ইউজার আইডি"></label><label>পাসওয়ার্ড<input name="password" type="password" required autocomplete="current-password" maxlength="128" placeholder="আপনার পাসওয়ার্ড"></label><button class="btn full" type="submit">লগইন করুন →</button><p class="error" role="alert"></p></form><p class="help">অ্যাকাউন্ট বা পাসওয়ার্ডের জন্য মূল অ্যাডমিনের সঙ্গে যোগাযোগ করুন।</p><a class="auth-back" href="${moderator?'/admin':'/moderator'}">${moderator?'অ্যাডমিন লগইন':'মডারেটর লগইন'} →</a><a class="auth-back" href="/">← মূল ওয়েবসাইট</a></section></main>`;
 bindForm(document.querySelector('#login-form'),async data=>{const result=await api('login',{method:'POST',body:JSON.stringify(data)});if(result.twoFactorRedirect){renderTwoFactor();return;}await startSession();});
}
async function startSession(){
 const data=await api('session');user=data.user;view=user.role==='admin'?'dashboard':'orders';page=1;selected.clear();filter={q:'',status:'',assignee:''};renderShell();portalStart();await loadCurrent();
}
function renderShell(){
 const admin=user.role==='admin';
 const menu=admin?[
   ['dashboard','grid','Dashboard'],['orders','orders','All orders'],
   ['callbacks','clock','Call Back Later'],['review','check','Confirmed by Moderator'],
   ['unapproved','alert','Cancelled / Unapproved'],['products','box','Products'],
   ['team','users','Moderators'],['notifications','bell','Notifications'],['settings','shield','Settings & security']
 ]:[['orders','orders','My work inbox'],['workhistory','clock','My history']];
 const panel=admin?'Admin Panel':'Moderator Page';
 document.title=panel+' | Ghorepawa';document.body.classList.toggle('moderator-mode',!admin);
 app.innerHTML=`<div class="shell"><button class="nav-shade" aria-label="Close navigation"></button><aside class="sidebar">${authLogo}<div class="panel-identity">${panel}</div><div class="nav-caption">${admin?'STORE OPERATIONS':'YOUR ASSIGNED WORK ONLY'}</div><nav class="nav-links" aria-label="Panel navigation">${menu.map(([v,i,label])=>`<button data-view="${v}">${icon(i)}<span>${label}</span></button>`).join('')}</nav><div class="sidebar-bottom">${admin?'<a href="/shop" target="_blank" rel="noopener">Product storefront &nearr;</a><a href="/" target="_blank" rel="noopener">Main website &nearr;</a>':'<p>Submit a call result to return the order to admin. History contains only a receipt.</p>'}<span class="workspace-label">Bangladesh time (UTC+6)<br>Ghorepawa &middot; Glass Workflow v3</span></div></aside><div class="workspace"><header class="topbar"><div class="topbar-title"><button class="btn secondary icon-only mobile-menu" id="menu-toggle" aria-label="Open navigation" aria-expanded="false">${icon('menu')}</button><span class="workspace-title"><strong>${panel}</strong><span id="breadcrumb">${admin?'Dashboard':'My work inbox'}</span></span><span id="connection" class="connection">Connecting</span></div><div class="top-actions"><button id="sound-toggle" class="btn secondary icon-only" aria-label="Enable notification sound" aria-pressed="false">${icon('volume')}</button>${admin?`<button id="open-notices" class="btn secondary icon-only" aria-label="Open notifications">${icon('bell')}<span class="count-dot" id="notice-count" hidden></span></button>`:''}<div class="user-chip"><div class="avatar" aria-hidden="true">${esc(user.name.slice(0,1))}</div><div class="user-name"><strong>${esc(user.name)}</strong><span>${admin?'Administrator':'Moderator'}</span></div></div><button class="btn secondary" id="logout">Log out</button></div></header><div id="updates-banner" class="updates-banner" hidden><span>New work is available. Refresh to load it.</span><button id="load-updates" class="btn secondary">Refresh</button></div><main id="content" class="content" tabindex="-1"></main></div></div>`;
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
 const allowed=user.role==='admin'?['dashboard','orders','callbacks','review','unapproved','products','team','notifications','settings']:['orders','workhistory'];
 if(!allowed.includes(next)){toast('This page is not available for your role.');return;}
 detailTicket++;dialog.close();dialog.innerHTML='';delete dialog.dataset.orderId;
 view=next;page=1;selected.clear();orders=[];filter={q:'',status:'',assignee:''};await loadCurrent();
}
async function loadCurrent({background=false}={}){
 if(!user||(background&&uiBusy()))return;
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
  const params=new URLSearchParams({...filter,page,section:view==='callbacks'?'callbacks':view==='review'?'confirmed':view==='unapproved'?'cancelled':''});
  const people=user.role==='admin'?(Date.now()-teamCacheAt<60000?Promise.resolve({members}):api('team?compact=1',{signal})):Promise.resolve(null);
  const [result,team]=await Promise.all([api('orders?'+params,{signal}),people]);
  if(id!==loadId||!user||(background&&uiBusy()))return;
  const key=JSON.stringify([currentView,params.toString(),result,team]);
  orders=result.orders;total=result.total;stats=result.stats;if(team){members=team.members;teamCacheAt=Date.now();}
  if(!background||key!==renderedOrdersKey){const current=new Set(orders.filter(assignable).map(o=>o.id));selected=new Set([...selected].filter(x=>current.has(x)));renderOrders();renderedOrdersKey=key;}
  document.querySelector('#updates-banner').hidden=true;
 }catch(e){if(e.name==='AbortError')return;if(id===loadId&&user){
   if(background){setConnection(false);return;}
   content.innerHTML=`<div class="notice" role="alert">${esc(e.message)}</div><button class="btn secondary" id="retry">Retry</button>`;document.querySelector('#retry').onclick=()=>loadCurrent();
 }}finally{if(id===loadId&&content.isConnected){content.classList.remove('is-loading');content.setAttribute('aria-busy','false');}}
}
function badge(status){return `<span class="badge ${esc(status)}">${esc(statusLabels[status]||status)}</span>`;}
function renderOrders(){
 if(user.role!=='admin'){renderModeratorInbox();return;}
 const count=Object.values(stats).reduce((a,b)=>a+b,0);
 const title=view==='review'?'Orders Confirmed by Moderator':view==='unapproved'?'Cancelled / Unapproved':view==='callbacks'?'Call Back Later':'All orders';
 const subtitle=view==='review'?'Moderator-confirmed orders return here. Send to courier, then mark Complete.':view==='callbacks'?'All callback customers and their notes. Reassign without losing the Call Back Later status.':'Assign work, review call results and manage fulfilment.';
 const cards=[['','All orders',count],['new','New',stats.new||0],['callback','Call back later',stats.callback||0],['confirmed','Confirmed',stats.confirmed||0],['delivered','Complete',stats.delivered||0]];
 const people=members.filter(m=>m.role==='moderator'&&m.status==='active');
 const statusOptions=view==='callbacks'?['callback']:view==='unapproved'?['cancelled','unapproved']:Object.keys(statusLabels);
 const target=document.querySelector('#content');
 target.innerHTML=`<div class="page-heading"><div><div class="eyebrow">ADMIN PANEL / ORDER MANAGEMENT</div><h1>${title}</h1><p>${subtitle}</p></div><button id="refresh" class="btn secondary">Refresh</button></div>${view==='orders'?`<div class="stats">${cards.map(([s,label,n])=>`<button class="stat ${filter.status===s?'active':''}" data-stat="${s}"><span>${label}</span><b>${number(n)}</b></button>`).join('')}</div>`:''}<div class="status-legend" aria-label="Order colors"><span class="legend-complete">Complete</span><span class="legend-callback">Call Back Later</span><span class="legend-confirmed">Moderator confirmed</span><span class="legend-cancelled">Cancelled</span></div><section class="panel" aria-label="Order list"><form id="filter-form" class="filters"><label>Search<input name="q" value="${esc(filter.q)}" placeholder="Name, phone or ES-reference" autocomplete="off"></label><label>Status<select name="status"><option value="">All in this section</option>${statusOptions.map(k=>`<option value="${k}" ${filter.status===k?'selected':''}>${esc(statusLabels[k])}</option>`).join('')}</select></label><label>Assigned moderator<select name="assignee"><option value="">All moderators</option><option value="unassigned" ${filter.assignee==='unassigned'?'selected':''}>With admin / unassigned</option>${members.filter(m=>m.role==='moderator').map(m=>`<option value="${esc(m.id)}" ${filter.assignee===m.id?'selected':''}>${staffOption(m)}</option>`).join('')}</select></label><button class="btn" type="submit">Filter</button></form><div class="bulk-bar"><span class="selection-count" id="selected-count">${number(selected.size)} selected</span><label for="bulk-assignee">Assign to</label><select id="bulk-assignee" aria-label="Moderator for assignment"><option value="">Choose moderator</option>${people.map(m=>`<option value="${esc(m.id)}">${staffOption(m)}</option>`).join('')}</select><button id="assign" class="btn" ${!selected.size?'disabled':''}>Assign selected</button><span id="assignee-chip"></span></div><div class="table-scroll"><table class="work-table"><thead><tr><th><input type="checkbox" id="select-all" aria-label="Select all assignable orders on this page"></th><th>Order / time</th><th>Customer</th><th>Area / note</th><th>Product / total</th><th>Status</th><th>Moderator</th><th>Actions</th></tr></thead><tbody>${orders.length?orders.map(o=>`<tr class="state-${esc(o.status)}" data-record-id="${esc(o.id)}"><td><input type="checkbox" data-select="${o.id}" aria-label="Select ES-${o.reference}" ${selected.has(o.id)?'checked':''} ${!assignable(o)?'disabled':''}></td><td><strong class="ref">ES-${esc(o.reference)}</strong><small>${date(o.created_at)}</small></td><td><strong>${esc(o.customer_name)}</strong><small><a class="phone-text" href="tel:+88${esc(o.phone)}">${esc(o.phone)}</a></small>${o.phone_orders>1?`<span class="duplicate">${number(o.phone_orders)} orders on this phone</span>`:''}</td><td>${esc(o.district)}<small>${esc(o.area)}</small>${o.latest_note?`<p class="call-note">${esc(o.latest_note)}</p>`:''}</td><td>${esc(o.product_name||'Ever Strong')} &times; ${number(o.quantity)}<small>${money(o.total)}</small></td><td>${badge(o.status)}${callbackTag(o)}${o.callback_at?`<small>Call: ${date(o.callback_at)}</small>`:''}</td><td>${o.assigned_to?staffChip(o.assigned_name,o.assigned_badge):'<span class="admin-custody">With admin</span>'}${o.confirmed_by?`<small>Confirmed by</small>${staffChip(o.confirmed_name,o.confirmed_badge)}`:''}</td><td><button class="row-open" data-open="${o.id}">Open &rarr;</button><button class="delete-order-link" data-delete-order="${o.id}" aria-label="Permanently delete order ES-${esc(o.reference)}">Delete</button></td></tr>`).join(''):'<tr><td colspan="8"><div class="empty"><strong>No orders in this list</strong>New orders or changed filters will appear here.</div></td></tr>'}</tbody></table></div><div class="pagination"><span>${number(total)} orders &middot; page ${number(page)} / ${number(Math.max(1,Math.ceil(total/30)))}</span><div><button id="prev" class="btn secondary" ${page<=1?'disabled':''}>Previous</button><button id="next" class="btn secondary" ${page*30>=total?'disabled':''}>Next</button></div></div></section>`;
 addOrderToolbar();
 target.querySelector('#refresh').onclick=()=>{selected.clear();loadCurrent();};
 target.querySelectorAll('[data-stat]').forEach(b=>b.onclick=()=>{filter.status=b.dataset.stat;page=1;selected.clear();loadCurrent();});
 target.querySelector('#filter-form').onsubmit=e=>{e.preventDefault();filter={q:'',status:'',assignee:'',...Object.fromEntries(new FormData(e.target))};page=1;selected.clear();loadCurrent();};
 bindOrderPaging(target);
 target.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openOrder(orders.find(o=>o.id===b.dataset.open)));
 target.querySelectorAll('[data-delete-order]').forEach(b=>b.onclick=()=>confirmOrderDelete(orders.find(o=>o.id===b.dataset.deleteOrder)));
 target.querySelectorAll('[data-select]').forEach(c=>c.onchange=()=>{c.checked?selected.add(c.dataset.select):selected.delete(c.dataset.select);syncSelection();});
 target.querySelector('#select-all').onchange=e=>{orders.filter(assignable).forEach(o=>e.target.checked?selected.add(o.id):selected.delete(o.id));syncSelection();};
 target.querySelector('#bulk-assignee').onchange=e=>{const m=members.find(m=>m.id===e.target.value);target.querySelector('#assignee-chip').innerHTML=m?staffChip(m.name,m.badge_number):'';};
 target.querySelector('#assign').onclick=async e=>{const b=e.currentTarget,assignee=target.querySelector('#bulk-assignee').value;
  if(!assignee||!selected.size){toast('Select orders and an active moderator.');return;}
  b.disabled=true;const ids=[...selected];
  try{await api('orders',{method:'PATCH',body:JSON.stringify({action:'assign',ids,assignee,versions:Object.fromEntries(orders.filter(o=>selected.has(o.id)).map(o=>[o.id,o.version]))})});toast(`${number(ids.length)} orders assigned.`);selected.clear();await loadCurrent();}
  catch(err){toast(err.message);b.disabled=false;}
 };syncSelection();
}
function syncSelection(){
 document.querySelectorAll('[data-select]').forEach(c=>c.checked=selected.has(c.dataset.select));
 const eligible=orders.filter(assignable),all=document.querySelector('#select-all');if(!all)return;
 all.checked=eligible.length>0&&eligible.every(o=>selected.has(o.id));all.indeterminate=selected.size>0&&!all.checked;
 document.querySelector('#selected-count').textContent=number(selected.size)+' selected';document.querySelector('#assign').disabled=!selected.size;
}
function nextStatuses(order){
 if(user.role==='moderator')return ['assigned','callback'].includes(order.status)?['confirmed','callback','cancelled']:[];
 return ({new:['cancelled'],assigned:['confirmed','callback','unapproved','cancelled'],callback:['confirmed','callback','unapproved','cancelled'],confirmed:['dispatched','approved','unapproved','cancelled'],approved:['dispatched','cancelled'],dispatched:['delivered','cancelled'],unapproved:['cancelled']})[order.status]||[];
}
let detailTicket=0;
async function openOrder(order){
 if(!order||!user)return;
 const ticket=++detailTicket,memberId=user.id;
 try{const result=await api('orders?id='+encodeURIComponent(order.id));
  if(ticket!==detailTicket||user?.id!==memberId)return;
  if(!result.orders.length){forgetOrder(order.id);toast('This order was removed or returned to admin.');await loadCurrent();return;}
  showOrderDetails(result.orders[0]);
 }catch(e){toast(e.message);}
}
function showOrderDetails(order){
 const admin=user.role==='admin',canNote=admin||['assigned','callback'].includes(order.status),choices=nextStatuses(order);
 dialog.innerHTML=`<div class="dialog-head"><div><div class="eyebrow">${admin?'ADMIN PANEL':'MODERATOR PAGE'}</div><h2 id="order-title">Order ES-${esc(order.reference)}</h2>${badge(order.status)}${callbackTag(order)}</div><button class="close" data-close aria-label="Close">&times;</button></div><div class="dialog-body"><div class="order-detail-grid"><div><span class="detail-label">Customer</span><strong class="detail-value">${esc(order.customer_name)}</strong></div><div><span class="detail-label">Received</span><span class="detail-value">${date(order.created_at)}</span></div><div class="wide"><span class="detail-label">Call customer</span><a class="call-link" href="tel:+88${esc(order.phone)}">${esc(order.phone)}</a></div><div class="wide"><span class="detail-label">Address</span><span class="detail-value">${esc(order.address)}, ${esc(order.area)}, ${esc(order.district)}</span></div><div><span class="detail-label">Product / quantity</span><span class="detail-value">${esc(order.product_name||'Ever Strong')} &times; ${number(order.quantity)}</span></div>${admin?`<div><span class="detail-label">Total</span><strong class="detail-value">${money(order.total)}</strong></div><div><span class="detail-label">Assigned to</span>${order.assigned_to?staffChip(order.assigned_name,order.assigned_badge):'<strong>With admin</strong>'}</div>${order.confirmed_by?`<div><span class="detail-label">Confirmed by moderator</span>${staffChip(order.confirmed_name,order.confirmed_badge)}</div>`:''}`:''}${order.callback_at?`<div><span class="detail-label">Call Back Later</span><span class="detail-value">${date(order.callback_at)}</span></div>`:''}${order.latest_note?`<div class="wide"><span class="detail-label">Call note</span><span class="detail-value">${esc(order.latest_note)}</span></div>`:''}</div>${canNote?`<section class="detail-actions"><h3>${admin?'Update fulfilment':'Call result & handoff'}</h3><form id="order-update"><label>Result<select name="status" ${admin?'':'required'}><option value="">${admin?'Save note only':'Choose call result'}</option>${choices.map(s=>`<option value="${s}">${s==='delivered'?'Complete - delivery finished':s==='dispatched'?'Send to courier':esc(statusLabels[s])}</option>`).join('')}</select></label><label id="callback-field" hidden>Call again (Bangladesh time)<input name="callbackAt" type="datetime-local"></label><label>Note / reason<textarea name="note" maxlength="1500" placeholder="No answer, requested another time, confirmed details..."></textarea></label><p class="help">${admin?'Only Complete marks an order green.':'Submit removes the order and customer details from your inbox. Only the order reference, result and time remain in your history.'} A note is required for callback or cancellation.</p><div class="form-actions"><button class="btn" type="submit">${admin?'Save update':'Submit to admin'}</button><button class="btn secondary" type="button" data-close>Close</button></div><p class="error" role="alert"></p></form></section>`:''}${admin?`<section class="history"><h3>Order history</h3><div id="history-content" role="status">Loading...</div></section><section class="danger-zone"><h3>Permanent deletion</h3><p>Remove this order and its customer information from the application.</p><button class="btn danger" id="delete-from-detail">Delete this order</button></section>`:''}</div>`;
 dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{dialog.close();dialog.innerHTML='';delete dialog.dataset.orderId;});
 dialog.dataset.orderId=order.id;dialog.dataset.orderVersion=String(order.version);if(!dialog.open)dialog.showModal();
 if(canNote){const form=dialog.querySelector('#order-update');form.elements.status.onchange=()=>{
   const value=form.elements.status.value,callback=value==='callback';dialog.querySelector('#callback-field').hidden=!callback;
   form.elements.callbackAt.required=callback;form.elements.note.required=['callback','cancelled','unapproved'].includes(value);
   if(callback&&!form.elements.callbackAt.value)form.elements.callbackAt.value=new Date(Date.now()+7*3600000).toISOString().slice(0,16);
  };
  bindForm(form,async data=>{let callbackAt=null;if(data.status==='callback'&&data.callbackAt)callbackAt=new Date(data.callbackAt+'+06:00').toISOString();
   const result=await api('orders',{method:'PATCH',body:JSON.stringify({action:data.status?'status':'note',id:order.id,version:order.version,status:data.status,note:data.note,callbackAt})});
   dialog.close();dialog.innerHTML='';delete dialog.dataset.orderId;if(!admin)forgetOrder(order.id);
   toast(result.returnedToAdmin?'Submitted to admin. A minimal receipt is in My history.':'Order updated.');await loadCurrent();
  });
 }
 if(admin){dialog.querySelector('#delete-from-detail').onclick=()=>confirmOrderDelete(order);
  api('history?id='+order.id).then(result=>{if(!dialog.open||dialog.dataset.orderId!==order.id||!dialog.querySelector('#history-content'))return;
   dialog.querySelector('#history-content').innerHTML=result.events.map(e=>`<div class="history-item"><strong>${e.kind==='created'?'Order received':e.kind==='assigned'?'Assigned to moderator':e.kind==='note'?'Note saved':`${esc(statusLabels[e.from_status]||'')} &rarr; ${esc(statusLabels[e.to_status]||'')}`}</strong><small>${esc(e.actor_name||'Website')} &middot; ${date(e.created_at)}</small>${e.note?`<p>${esc(e.note)}</p>`:''}</div>`).join('');
  }).catch(e=>{const h=dialog.querySelector('#history-content');if(h)h.textContent=e.message;});
 }
}
function renderTeam(){document.querySelector('#content').innerHTML=`<div class="page-heading"><div><h1>টিম ম্যানেজমেন্ট</h1><p>আলাদা অ্যাকাউন্ট, অনুমোদন ও কাজের অগ্রগতি পরিচালনা করুন।</p></div><button class="btn" id="new-member">+ মডারেটর যোগ করুন</button></div><div class="notice">নতুন মডারেটর তৈরির পর “অনুমোদন দিন” চাপলে তিনি লগইন করে কাজ করতে পারবেন।</div><div class="team-grid">${members.map(m=>`<article class="member-card"><div class="member-header"><div>${m.role==='moderator'?staffChip(m.name,m.badge_number):'<h3>'+esc(m.name)+'</h3>'}<span class="muted small">@${esc(m.username)}</span></div><span class="badge ${m.status==='active'?'approved':m.status==='pending'?'callback':'unapproved'}">${m.role==='admin'?'মূল অ্যাডমিন':m.status==='active'?'সক্রিয়':m.status==='pending'?'অনুমোদন বাকি':'বন্ধ'}</span></div><div class="member-numbers"><div><b>${number(m.total_orders)}</b><span>বরাদ্দ</span></div><div><b>${number(m.confirmed_orders)}</b><span>কনফার্ম</span></div><div><b>${number(m.pending_orders)}</b><span>বাকি</span></div></div>${m.role==='moderator'?`<div class="member-actions"><button class="btn ${m.status==='active'?'danger':''}" data-member-status="${esc(m.id)}" data-status="${m.status==='active'?'disabled':'active'}">${m.status==='active'?'অ্যাকাউন্ট বন্ধ করুন':m.status==='pending'?'অনুমোদন দিন':'আবার সক্রিয় করুন'}</button><button class="btn secondary" data-reset="${esc(m.id)}">পাসওয়ার্ড বদলান</button></div>`:'<p class="help">সব অর্ডার ও টিমের নিয়ন্ত্রণ</p>'}</article>`).join('')}</div>`;
 document.querySelector('#new-member').onclick=()=>openMember();document.querySelectorAll('[data-reset]').forEach(b=>b.onclick=()=>openMember(members.find(m=>m.id===b.dataset.reset)));
 document.querySelectorAll('[data-member-status]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await api('team',{method:'PATCH',body:JSON.stringify({id:b.dataset.memberStatus,status:b.dataset.status})});toast('অ্যাকাউন্টের অবস্থা বদলেছে।');await loadCurrent();}catch(e){toast(e.message);b.disabled=false;}});
}
function openMember(member){memberDialog.innerHTML=`<div class="dialog-head"><h2 id="member-title">${member?'পাসওয়ার্ড পরিবর্তন':'নতুন মডারেটর'}</h2><button class="close" aria-label="বন্ধ করুন">×</button></div><div class="dialog-body"><form id="member-form" class="form-stack">${member?`<p>${esc(member.name)} · @${esc(member.username)}</p>`:'<label>মডারেটরের নাম<input name="name" required minlength="2" maxlength="100" autocomplete="off"></label><label>ইউজার আইডি<input name="username" required minlength="3" maxlength="40" autocomplete="off" autocapitalize="none"><p class="help">ইংরেজি অক্ষর / সংখ্যা, যেমন moderator1</p></label>'}<label>${member?'নতুন পাসওয়ার্ড':'প্রাথমিক পাসওয়ার্ড'}<input name="password" type="password" required minlength="12" maxlength="128" autocomplete="new-password"><p class="help">কমপক্ষে ১২ অক্ষর। সদস্যকে ব্যক্তিগতভাবে লগইন তথ্য দিন।</p></label><button class="btn" type="submit">${member?'পাসওয়ার্ড পরিবর্তন করুন':'অ্যাকাউন্ট তৈরি করুন'}</button><p class="error" role="alert"></p></form></div>`;memberDialog.querySelector('.close').onclick=()=>memberDialog.close();memberDialog.showModal();bindForm(memberDialog.querySelector('form'),async data=>{await api('team',{method:member?'PATCH':'POST',body:JSON.stringify(member?{action:'password',id:member.id,password:data.password}:data)});memberDialog.close();toast(member?'পাসওয়ার্ড বদলেছে। পুরোনো সেশনগুলো বন্ধ হয়েছে।':'মডারেটর তৈরি হয়েছে। এবার অনুমোদন দিন।');await loadCurrent();});}
async function renderSettings(){if(user?.role!=='admin')return;document.querySelector('#content').innerHTML=`<div class="page-heading"><div><h1>অ্যাকাউন্টের নিরাপত্তা</h1><p>আপনার লগইনের পাসওয়ার্ড পরিবর্তন করুন।</p></div></div><section class="panel settings-card"><form id="password-form" class="form-stack"><label>বর্তমান পাসওয়ার্ড<input name="currentPassword" type="password" required autocomplete="current-password"></label><label>নতুন পাসওয়ার্ড<input name="newPassword" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></label><label>নতুন পাসওয়ার্ড আবার লিখুন<input name="confirm" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></label><button class="btn" type="submit">পাসওয়ার্ড পরিবর্তন করুন</button><p class="error" role="alert"></p></form></section>`;bindForm(document.querySelector('#password-form'),async data=>{if(data.newPassword!==data.confirm)throw new Error('দুটি নতুন পাসওয়ার্ড মিলছে না।');await api('session',{method:'POST',body:JSON.stringify({action:'password',...data})});toast('পাসওয়ার্ড পরিবর্তন হয়েছে।');await renderSettings();});await renderSecurity();addNotificationSettings();}

function renderTwoFactor(recovery=false){
 app.innerHTML=`<main class="auth-page"><section class="auth-card">${authLogo}<h1>${recovery?'ব্যাকআপ কোড':'দুই ধাপের নিরাপত্তা'}</h1><p>${recovery?'সংরক্ষণ করা একটি অব্যবহৃত ব্যাকআপ কোড লিখুন।':'Google Authenticator অ্যাপের ৬ সংখ্যার কোড লিখুন।'}</p><form id="two-factor-login"><label>${recovery?'ব্যাকআপ কোড':'Authenticator কোড'}<input name="code" required autocomplete="one-time-code" ${recovery?'':'inputmode="numeric" pattern="[0-9]{6}" maxlength="6"'}></label><button class="btn full" type="submit">যাচাই করে প্রবেশ করুন</button><p class="error" role="alert"></p></form><button class="btn secondary" id="recovery-toggle">${recovery?'Authenticator ব্যবহার করুন':'ফোন নেই? ব্যাকআপ কোড ব্যবহার করুন'}</button><button class="auth-back" id="back-login">লগইনে ফিরুন</button></section></main>`;
 document.querySelector('#recovery-toggle').onclick=()=>renderTwoFactor(!recovery);
 document.querySelector('#back-login').onclick=renderLogin;
 bindForm(document.querySelector('#two-factor-login'),async data=>{await api('security',{method:'POST',body:JSON.stringify({action:recovery?'recover':'verify',code:data.code})});await startSession();});
}
async function renderSecurity(){
 const target=document.querySelector('#content');
 const section=document.createElement('section');section.className='panel settings-card security-card';target.append(section);
 try{const data=await api('security');if(!section.isConnected)return;
 section.innerHTML=`<h2>Google Authenticator</h2><p class="badge ${data.enabled?'approved':'callback'}">${data.enabled?'2FA চালু আছে':'2FA এখনো চালু নয়'}</p><p class="help">পাসওয়ার্ডের পাশাপাশি আপনার ফোনের কোড দিয়ে লগইন সুরক্ষিত করুন।</p><form id="security-form" class="form-stack"><label>বর্তমান পাসওয়ার্ড<input name="password" type="password" required autocomplete="current-password"></label>${data.enabled?'<label>Authenticator অথবা অব্যবহৃত ব্যাকআপ কোড<input name="code" required maxlength="100" autocomplete="one-time-code"></label>':''}<button class="btn ${data.enabled?'danger':''}" type="submit">${data.enabled?'2FA বন্ধ করুন':'Authenticator সংযোগ করুন'}</button><p class="error" role="alert"></p></form>`;
 bindForm(section.querySelector('form'),async values=>{
  const result=await api('security',{method:'POST',body:JSON.stringify({...values,action:data.enabled?'disable':'enable'})});
  if(data.enabled){toast('2FA বন্ধ হয়েছে।');await renderSettings();return;}
  section.innerHTML=`<h2>Authenticator সংযোগ করুন</h2><ol><li>Google Authenticator খুলে + চাপুন এবং QR কোড স্ক্যান করুন।</li><li>একই ফোন হলে “Enter a setup key” বেছে নিচের কী ব্যবহার করুন। ধরন: Time based।</li><li>ব্যাকআপ কোড নিরাপদ জায়গায় রাখুন, তারপর অ্যাপের কোড দিয়ে নিশ্চিত করুন।</li></ol><img class="auth-qr" src="${esc(result.qr)}" width="240" height="240" alt="Authenticator setup QR"><label>সেটআপ কী<input readonly value="${esc(result.secret)}" aria-label="Authenticator setup key"></label><h3>একবার ব্যবহারযোগ্য ব্যাকআপ কোড</h3><p class="help">ফোন হারালে লগইনের জন্য প্রয়োজন হবে। কাউকে দেবেন না।</p><pre class="backup-codes">${esc(result.backupCodes.join('\n'))}</pre><button class="btn secondary" id="save-codes">ব্যাকআপ কোড ডাউনলোড করুন</button><form id="verify-enrollment" class="form-stack"><label>Authenticator-এর ৬ সংখ্যার কোড<input name="code" required inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code"></label><button class="btn" type="submit">যাচাই করে 2FA চালু করুন</button><p class="error" role="alert"></p></form>`;
  section.querySelector('#save-codes').onclick=()=>{const url=URL.createObjectURL(new Blob(['Ever Strong recovery codes\n'+result.backupCodes.join('\n')],{type:'text/plain'}));const a=document.createElement('a');a.href=url;a.download='ever-strong-recovery-codes.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  bindForm(section.querySelector('form'),async values=>{await api('security',{method:'POST',body:JSON.stringify({action:'verify',code:values.code})});toast('Google Authenticator সংযুক্ত হয়েছে। 2FA চালু।');await renderSettings();});
 });
 }catch(e){section.textContent=e.message;}
 if(user?.role==='admin'&&target.isConnected&&section.isConnected&&view==='settings'){const backup=document.createElement('section');backup.className='panel settings-card security-card';backup.innerHTML='<h2>অর্ডার ও টিমের ব্যাকআপ</h2><p>সমস্ত অর্ডার, টিমের সদস্য এবং কাজের ইতিহাস JSON ফাইলে ডাউনলোড করুন। পাসওয়ার্ড ও Authenticator কী এতে থাকে না।</p><a class="btn" href="/api/export" download>সম্পূর্ণ ডেটা ডাউনলোড করুন</a><p class="help">এই ফাইলে কাস্টমারের তথ্য আছে। নিরাপদ জায়গায় রাখুন। Admin can erase individual orders after explicit confirmation. Existing downloads are not erased.</p>';target.append(backup);}
}

// Polling is coordinated by portal.js; no overlapping interval rerenders.
