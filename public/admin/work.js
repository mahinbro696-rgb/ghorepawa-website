'use strict';
// Helpers shared by the scoped moderator inbox and the admin work queues.
function staffOption(m){return `M-${String(m.badge_number||0).padStart(3,'0')} ${esc(m.name)}${m.status!=='active'?' (inactive)':''}`;}
function staffChip(name,n){
 const value=Math.max(0,Number(n)||0),tone=value%24,symbol=['&#9670;','&#9679;','&#9650;','&#9632;','&#10022;','&#11042;'][Math.floor(value/24)%6];
 return `<span class="staff-chip staff-${tone}"><span class="staff-symbol" aria-hidden="true">${symbol}</span><b>M-${String(value).padStart(3,'0')}</b><span>${esc(name||'Moderator')}</span></span>`;
}
function callbackTag(o){return o.callback_customer?'<span class="callback-customer">Call Back Later customer</span>':'';}
function bindOrderPaging(target){
 target.querySelector('#prev').onclick=()=>{page--;selected.clear();loadCurrent();};
 target.querySelector('#next').onclick=()=>{page++;selected.clear();loadCurrent();};
}
function forgetOrder(id){
 orders=orders.filter(o=>o.id!==id);selected.delete(id);renderedOrdersKey='';
 for(const element of document.querySelectorAll('[data-record-id]'))if(element.dataset.recordId===id)element.remove();
 if(dialog.dataset.orderId===id){detailTicket++;dialog.close();dialog.innerHTML='';delete dialog.dataset.orderId;}
 if(noticeData?.items)noticeData.items=noticeData.items.filter(n=>n.order_id!==id);
}
function scrubModeratorData(){
 if(user?.role!=='moderator')return;
 readController?.abort();loadId++;detailTicket++;orders=[];selected.clear();renderedOrdersKey='';
 dialog.close();dialog.innerHTML='';delete dialog.dataset.orderId;
 const target=document.querySelector('#content');
 if(target&&['orders','allorders'].includes(view))target.innerHTML='<section class="panel privacy-cover"><h1>Moderator Page</h1><p>Customer details are hidden until access is checked again.</p><button class="btn" id="reload-work">Load my work</button></section>';
 const reload=document.querySelector('#reload-work');if(reload)reload.onclick=()=>loadCurrent();
}
function syncModeratorAccess(ids,tracked=[]){
 if(user?.role!=='moderator'||!Array.isArray(ids))return;
 const allowed=new Set(ids),checked=new Set(tracked),removed=orders.filter(o=>checked.has(o.id)&&!allowed.has(o.id)).map(o=>o.id);
 const openId=dialog.dataset.orderId;if(openId&&checked.has(openId)&&!allowed.has(openId))removed.push(openId);
 if(removed.length){detailTicket++;for(const id of new Set(removed))forgetOrder(id);toast('An order was removed or reassigned. Access has been cleared.');}
}
function renderModeratorInbox(){
 const target=document.querySelector('#content');
 const callbacks=orders.filter(o=>o.callback_customer||o.status==='callback').length;
 target.innerHTML=`<div class="page-heading inbox-heading"><div><div class="eyebrow">MODERATOR PAGE</div><h1>My work inbox</h1><p>${number(total)} current tasks &middot; Only your assigned work</p></div><button class="btn secondary" id="refresh">Refresh work</button></div><section class="panel inbox-panel" aria-label="Assigned work"><form id="filter-form" class="work-search"><label>Find a task<input name="q" value="${esc(filter.q)}" placeholder="Name, phone, address or ES-reference" maxlength="100" autocomplete="off"></label><button class="btn" type="submit">Search</button></form><div class="inbox-caption"><strong>Assigned to you</strong><span>${number(orders.length)} on this page${callbacks?` &middot; ${number(callbacks)} callback`:''}</span></div><div class="inbox-columns" aria-hidden="true"><span>Order / customer</span><span>Contact / delivery</span><span>Product / call note</span><span>Next action</span></div><div class="moderator-work-list" role="list">${orders.length?orders.map(o=>`<article class="work-card state-${esc(o.status)}" data-record-id="${esc(o.id)}" role="listitem"><div class="task-identity"><div class="work-card-top"><b class="ref">ES-${esc(o.reference)}</b>${badge(o.status)}</div><h2 title="${esc(o.customer_name)}">${esc(o.customer_name)}</h2>${o.callback_customer?'<span class="callback-customer">Call Back Later customer</span>':''}</div><div class="task-contact"><a class="call-link" href="tel:+88${esc(o.phone)}" aria-label="Call ${esc(o.phone)}"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.35 1.9.69 2.79a2 2 0 0 1-.45 2.11L8.09 9.89a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.89.34 1.83.57 2.79.69A2 2 0 0 1 22 16.92z"/></svg>${esc(o.phone)}</a><p class="work-location" title="${esc(o.address)}, ${esc(o.area)}, ${esc(o.district)}">${esc(o.area)}, ${esc(o.district)}</p></div><div class="task-context"><p class="task-product" title="${esc(o.product_name||'Ever Strong')}">${esc(o.product_name||'Ever Strong')} <span>&times; ${number(o.quantity)}</span></p>${o.callback_at?`<p class="callback-time">${icon('clock')} ${date(o.callback_at)}</p>`:''}${o.latest_note?`<p class="call-note" title="${esc(o.latest_note)}">${esc(o.latest_note)}</p>`:'<p class="task-hint">Open to review details and submit a call result.</p>'}</div><div class="task-actions"><button class="btn" data-open="${esc(o.id)}" aria-label="Open task ES-${esc(o.reference)} and submit call result">Open task <span aria-hidden="true">&rarr;</span></button></div></article>`).join(''):'<div class="empty"><strong>Your inbox is clear</strong>Submitted work is with admin. A new assignment will appear here.</div>'}</div><div class="pagination"><span>Page ${number(page)} / ${number(Math.max(1,Math.ceil(total/30)))}</span><div><button id="prev" class="btn secondary" ${page<=1?'disabled':''}>Previous</button><button id="next" class="btn secondary" ${page*30>=total?'disabled':''}>Next</button></div></div></section>`;
 target.querySelector('#refresh').onclick=()=>loadCurrent();
 target.querySelector('#filter-form').onsubmit=e=>{e.preventDefault();filter={q:new FormData(e.target).get('q'),status:'',assignee:''};page=1;loadCurrent();};
 target.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openOrder(orders.find(o=>o.id===b.dataset.open)));
 bindOrderPaging(target);
}
async function renderWorkHistory(id,signal){
 const data=await api('workhistory?page='+page,{signal});if(id!==loadId||user?.role!=='moderator'||view!=='workhistory')return;
 const target=document.querySelector('#content');
 target.innerHTML=`<div class="page-heading"><div><div class="eyebrow">MODERATOR PAGE</div><h1>My history</h1><p>Submission receipts only. Customer details and full orders are with admin.</p></div><button id="history-refresh" class="btn secondary">Refresh</button></div><section class="panel"><div class="table-scroll"><table class="receipt-table"><thead><tr><th>Order reference</th><th>My submitted result</th><th>Submitted at</th></tr></thead><tbody>${data.items.length?data.items.map(h=>`<tr class="state-${esc(h.outcome)}"><td><strong>ES-${esc(h.reference)}</strong></td><td>${badge(h.outcome)}</td><td>${date(h.submitted_at)}</td></tr>`).join(''):'<tr><td colspan="3"><div class="empty"><strong>No submitted work yet</strong>A receipt appears after you submit a call result.</div></td></tr>'}</tbody></table></div></section><div class="pagination"><span>${number(data.total)} receipts</span><div><button id="prev" class="btn secondary" ${page<=1?'disabled':''}>Previous</button><button id="next" class="btn secondary" ${page*30>=data.total?'disabled':''}>Next</button></div></div>`;
 target.querySelector('#history-refresh').onclick=()=>loadCurrent();bindOrderPaging(target);
}
async function confirmOrderDelete(order){
 if(user?.role!=='admin'||!order)return;
 // Re-read for a fresh version/reference before the explicit destructive confirmation.
 const ticket=++detailTicket;
 try{const result=await api('orders?id='+encodeURIComponent(order.id));if(user?.role!=='admin'||ticket!==detailTicket)return;
  const current=result.orders[0];if(!current){forgetOrder(order.id);toast('Order already removed.');await loadCurrent();return;}
  const warning='Permanently deleting this order removes its customer details, notes, order history and moderator submission receipts. This cannot be undone in this application.';
  dialog.innerHTML=`<div class="dialog-head"><div><div class="eyebrow danger-text">ADMIN ONLY</div><h2 id="order-title">Permanently delete ES-${esc(current.reference)}?</h2></div><button class="close" data-delete-close aria-label="Close">&times;</button></div><div class="dialog-body"><div class="delete-warning" role="alert"><p lang="en">${warning}</p><p>This deletes this order's customer details, notes, order history and all moderator receipts. It disappears from every moderator's inbox. This cannot be undone in this app.</p></div><p class="help">Other orders or products are not deleted. Previously downloaded exports, provider backups and external copies are not erased.</p><form id="delete-order-form"><label class="consent-row"><input type="checkbox" name="consent" id="delete-consent" required><span>I have read the warning and agree to permanently delete this order.</span></label><div class="form-actions"><button class="btn danger" type="submit" id="confirm-delete" disabled>Yes, permanently delete</button><button class="btn secondary" type="button" data-delete-close>Cancel</button></div><p class="error" role="alert"></p></form></div>`;
  dialog.dataset.orderId=current.id;if(!dialog.open)dialog.showModal();
  dialog.querySelectorAll('[data-delete-close]').forEach(b=>b.onclick=()=>{if(!mutationBusy){dialog.close();dialog.innerHTML='';delete dialog.dataset.orderId;}});
  const form=dialog.querySelector('form'),check=form.querySelector('#delete-consent'),yes=form.querySelector('#confirm-delete');
  check.onchange=()=>{yes.disabled=!check.checked;};
  bindForm(form,async()=>{
   if(!check.checked)throw new Error('Tick the consent box first.');
   await api('orders',{method:'DELETE',body:JSON.stringify({id:current.id,reference:String(current.reference),version:current.version,confirmPermanentDelete:true})});
   forgetOrder(current.id);toast('Order and its customer details permanently deleted.');await loadCurrent();
  });
 }catch(e){toast(e.message);}
}
// Clear sensitive DOM on logout/close and when a moderator tab becomes hidden.
// Authorization remains server-enforced; this does not pretend to recall screenshots or exports.
dialog.addEventListener('close',()=>{if(!dialog.open){dialog.innerHTML='';delete dialog.dataset.orderId;}});
window.addEventListener('offline',()=>{if(user?.role==='moderator')scrubModeratorData();});
window.addEventListener('online',()=>{if(user?.role==='moderator'&&!document.hidden)loadCurrent();});

function renderModeratorAllOrders(){
 const target=document.querySelector('#content');
 target.innerHTML=`<div class="page-heading"><div><div class="eyebrow">MODERATOR PAGE / READ ONLY</div><h1>All orders</h1><p>View all orders. Use My work inbox to submit results for your assigned tasks.</p></div><button class="btn secondary" id="refresh">Refresh</button></div>
 <form id="shared-order-search" class="panel shared-order-search"><label>Search orders<input name="q" value="${esc(filter.q)}" placeholder="Name, phone, address or order reference" maxlength="100" autocomplete="off"></label><label>Status<select name="status"><option value="">All statuses</option>${Object.entries(statusLabels).map(([k,v])=>`<option value="${k}" ${filter.status===k?'selected':''}>${v}</option>`).join('')}</select></label><button type="submit" class="btn">Search</button></form>
 <section class="panel shared-orders"><div class="table-scroll"><table><thead><tr><th>Order</th><th>Customer / phone</th><th>Location</th><th>Product / quantity</th><th>Status</th><th>Action</th></tr></thead><tbody>${orders.length?orders.map(o=>`<tr class="state-${esc(o.status)}" data-record-id="${esc(o.id)}"><td><b class="ref">ES-${esc(o.reference)}</b><small>${date(o.created_at)}</small></td><td><strong>${esc(o.customer_name)}</strong><span>${esc(o.phone)}</span></td><td><span>${esc(o.area)}, ${esc(o.district)}</span></td><td><span>${esc(o.product_name||'Ever Strong')} &times; ${number(o.quantity)}</span></td><td>${badge(o.status)}</td><td><button type="button" class="btn secondary" data-open="${esc(o.id)}">View</button></td></tr>`).join(''):'<tr><td colspan="6"><div class="empty">No matching orders.</div></td></tr>'}</tbody></table></div></section>
 <div class="pagination"><span>${number(total)} orders / page ${number(page)} of ${number(Math.max(1,Math.ceil(total/30)))}</span><div><button class="btn secondary" id="prev" ${page<=1?'disabled':''}>Previous</button><button class="btn secondary" id="next" ${page*30>=total?'disabled':''}>Next</button></div></div>`;
 target.querySelector('#refresh').onclick=()=>loadCurrent();
 target.querySelector('form').onsubmit=e=>{e.preventDefault();filter={q:String(new FormData(e.target).get('q')||'').trim(),status:String(new FormData(e.target).get('status')||''),assignee:''};page=1;loadCurrent();};
 target.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openOrder(orders.find(o=>o.id===b.dataset.open)));
 bindOrderPaging(target);
}
