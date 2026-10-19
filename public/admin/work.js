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
 if(target&&view==='orders')target.innerHTML='<section class="panel privacy-cover"><h1>Moderator Page</h1><p>Customer details are hidden until access is checked again.</p><button class="btn" id="reload-work">Load my work</button></section>';
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
 target.innerHTML=`<div class="page-heading"><div><div class="eyebrow">MODERATOR PAGE</div><h1>My work inbox</h1><p>${number(total)} assigned tasks. Finish a call and submit the result to admin.</p></div><button class="btn secondary" id="refresh">Refresh work</button></div><form id="filter-form" class="panel work-search"><label>Find an assigned task<input name="q" value="${esc(filter.q)}" placeholder="Customer name, phone or reference" autocomplete="off"></label><button class="btn" type="submit">Search</button></form><div class="moderator-work-list">${orders.length?orders.map(o=>`<article class="work-card state-${esc(o.status)}" data-record-id="${esc(o.id)}"><div class="work-card-top"><b class="ref">ES-${esc(o.reference)}</b>${badge(o.status)}</div><h2>${esc(o.customer_name)}</h2><a class="call-link" href="tel:+88${esc(o.phone)}">${esc(o.phone)}</a><p class="work-location">${esc(o.area)}, ${esc(o.district)}</p><p>${esc(o.product_name||'Ever Strong')} &times; ${number(o.quantity)}</p>${callbackTag(o)}${o.callback_at?`<p class="callback-time">Call again: ${date(o.callback_at)}</p>`:''}${o.latest_note?`<p class="call-note">${esc(o.latest_note)}</p>`:''}<button class="btn" data-open="${o.id}">Call result / Submit</button></article>`).join(''):'<section class="panel empty"><strong>Your inbox is clear</strong>Only your current assigned tasks appear here. Submitted work is returned to admin.</section>'}</div><div class="pagination"><span>Page ${number(page)} / ${number(Math.max(1,Math.ceil(total/30)))}</span><div><button id="prev" class="btn secondary" ${page<=1?'disabled':''}>Previous</button><button id="next" class="btn secondary" ${page*30>=total?'disabled':''}>Next</button></div></div>`;
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
  const warning='\u098f\u0987 \u0985\u09b0\u09cd\u09a1\u09be\u09b0 \u09a1\u09bf\u09b2\u09bf\u099f \u0995\u09b0\u09b2\u09c7 \u0997\u09cd\u09b0\u09be\u09b9\u0995\u09c7\u09b0 \u09a8\u09be\u09ae, \u09ab\u09cb\u09a8, \u09a0\u09bf\u0995\u09be\u09a8\u09be, \u09a8\u09cb\u099f \u0993 \u098f\u0987 \u0985\u09b0\u09cd\u09a1\u09be\u09b0\u09c7\u09b0 \u0987\u09a4\u09bf\u09b9\u09be\u09b8 \u09b8\u09cd\u09a5\u09be\u09df\u09c0\u09ad\u09be\u09ac\u09c7 \u09ae\u09c1\u099b\u09c7 \u09af\u09be\u09ac\u09c7\u0964';
  dialog.innerHTML=`<div class="dialog-head"><div><div class="eyebrow danger-text">ADMIN ONLY</div><h2 id="order-title">Permanently delete ES-${esc(current.reference)}?</h2></div><button class="close" data-delete-close aria-label="Close">&times;</button></div><div class="dialog-body"><div class="delete-warning" role="alert"><p lang="bn">${warning}</p><p>This deletes this order's customer details, notes, order history and all moderator receipts. It disappears from every moderator's inbox. This cannot be undone in this app.</p></div><p class="help">Other orders or products are not deleted. Previously downloaded exports, provider backups and external copies are not erased.</p><form id="delete-order-form"><label class="consent-row"><input type="checkbox" name="consent" id="delete-consent" required><span>I have read the warning and agree to permanently delete this order.</span></label><div class="form-actions"><button class="btn danger" type="submit" id="confirm-delete" disabled>Yes, permanently delete</button><button class="btn secondary" type="button" data-delete-close>Cancel</button></div><p class="error" role="alert"></p></form></div>`;
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
