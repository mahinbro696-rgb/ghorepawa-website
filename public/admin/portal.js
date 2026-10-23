"use strict";
const iconPaths={grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',orders:'M6 3h12v18H6z M9 8h6 M9 12h6 M9 16h4',check:'M5 12l4 4L19 6 M21 12v8H3V4h12',alert:'M12 3L2 21h20L12 3z M12 9v5 M12 17v1',box:'M3 7l9-4 9 4v10l-9 4-9-4V7z M3 7l9 4 9-4 M12 11v10',users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-4 M17 3a4 4 0 0 1 0 8',clock:'M12 8v5l3 2 M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20',bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',shield:'M12 2L3 6v6c0 6 9 10 9 10s9-4 9-10V6l-9-4z M8 12l3 3 5-6',volume:'M11 4L6 8H2v8h4l5 4V4z M15 8a6 6 0 0 1 0 8 M18 5a10 10 0 0 1 0 14',external:'M14 3h7v7 M21 3L10 14 M10 3H3v18h18v-7',menu:'M3 6h18 M3 12h18 M3 18h18',money:'M3 5h18v14H3z M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8',trend:'M3 17l6-6 4 4 8-10 M15 5h6v6',plus:'M12 4v16 M4 12h16'};
function icon(name){return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${iconPaths[name]||iconPaths.box}"/></svg>`;}
function closeMobileMenu(){document.body.classList.remove('mobile-nav-open');document.querySelector('#menu-toggle')?.setAttribute('aria-expanded','false');}
function uiBusy(){return !!(mutationBusy||dialog.open||memberDialog.open||selected.size||['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName));}
function setConnection(ok){const el=document.querySelector('#connection');if(el){el.textContent=ok?'Synced':'Retrying';el.classList.toggle('offline',!ok);if(ok)el.title='Last checked: '+date(new Date().toISOString());}}
let products=[],productPage=1,productQuery='',noticeData=null,noticeBefore='',noticeTimer=null,noticeGeneration=0,lastOrderPoll=0,lastSounded='0',audio=null,portalPrefs={sound:false,desktop:false};
const prefKey=()=>`ghorepawa.portal.${user?.id||'anonymous'}`;
function readPrefs(){try{return JSON.parse(localStorage.getItem(prefKey())||'{}');}catch{return {};}}
function savePrefs(){try{localStorage.setItem(prefKey(),JSON.stringify(portalPrefs));}catch{}}
function syncSoundButton(){const b=document.querySelector('#sound-toggle');if(b){b.setAttribute('aria-pressed',String(!!portalPrefs.sound));b.title=portalPrefs.sound?'Sound enabled. Click to mute.':'Enable notification sound';b.setAttribute('aria-label',b.title);}}
async function chime(force=false){
 if(!force&&!portalPrefs.sound)return;
 const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
 try{audio||=new Audio();await audio.resume();if(audio.state!=='running')return;
  const now=audio.currentTime;[660,880].forEach((frequency,i)=>{const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.type='sine';oscillator.frequency.value=frequency;
   gain.gain.setValueAtTime(0,now+i*.16);gain.gain.linearRampToValueAtTime(.07,now+i*.16+.015);gain.gain.exponentialRampToValueAtTime(.001,now+i*.16+.2);
   oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(now+i*.16);oscillator.stop(now+i*.16+.22);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};});
 }catch{/* Audio permission never blocks order management. */}
}
async function toggleSound(){portalPrefs.sound=!portalPrefs.sound;savePrefs();syncSoundButton();if(portalPrefs.sound)await chime(true);toast(portalPrefs.sound?'Notification sound enabled for this browser.':'Notification sound muted.');}
function portalStop(){clearTimeout(noticeTimer);noticeTimer=null;noticeGeneration++;noticeData=null;lastSounded='0';closeMobileMenu();}
function portalStart(){portalStop();portalPrefs={sound:false,desktop:false,...readPrefs()};syncSoundButton();const g=noticeGeneration;pollNotices(g);}
async function announceNotice(id){
 const notify=async()=>{
  const key=prefKey()+'.last-notice';let previous='0';try{previous=localStorage.getItem(key)||'0';}catch{}
  if(!/^\d+$/.test(previous))previous='0';if(BigInt(id)<=BigInt(previous))return;
  try{localStorage.setItem(key,id);}catch{}
  await chime();
  if(portalPrefs.desktop&&'Notification' in window&&Notification.permission==='granted'&&!document.hasFocus()){
   try{const n=new Notification('Ghorepawa: new order activity',{body:'Open your workspace to review updates.',tag:'ghorepawa-orders'});n.onclick=()=>{window.focus();navigate(user?.role==='admin'?'notifications':'orders');n.close();};}catch{}
  }
 };
 if(navigator.locks){await navigator.locks.request('ghorepawa-notice-'+user.id,{ifAvailable:true},lock=>lock?notify():undefined);}else await notify();
}
async function pollNotices(g){
 if(g!==noticeGeneration||!user)return;
 if(!document.hidden){
  try{const tracked=user.role==='moderator'?[...new Set([...orders.map(o=>o.id),dialog.dataset.orderId].filter(Boolean))].slice(0,31):[];const data=await api('notifications?'+new URLSearchParams({tracked:tracked.join(','),scope:user.role==='moderator'&&view==='allorders'?'all':'inbox'}));if(g!==noticeGeneration||!user)return;
   syncModeratorAccess(data.accessibleIds,tracked);const prior=noticeData;noticeData=data;
   const badge=document.querySelector('#notice-count');if(badge){badge.hidden=!data.unread;badge.textContent=data.unread>99?'99+':String(data.unread);document.querySelector('#open-notices').setAttribute('aria-label',`${data.unread} unread notifications`);}
   setConnection(true);
   if(prior&&BigInt(data.latestId)>BigInt(prior.latestId)&&BigInt(data.latestId)>BigInt(lastSounded)){lastSounded=data.latestId;document.querySelector('#updates-banner').hidden=false;await announceNotice(data.latestId);}
   if(!prior)lastSounded=data.latestId;
   if(Date.now()-lastOrderPoll>(user.role==='moderator'?14000:30000)&&!uiBusy()&&['orders','neworders','allorders','review','completed','unapproved','callbacks','workhistory'].includes(view)){lastOrderPoll=Date.now();await loadCurrent({background:true});}
  }catch{if(g===noticeGeneration){setConnection(false);if(user?.role==='moderator')scrubModeratorData();}}
 }
 if(g===noticeGeneration&&user)noticeTimer=setTimeout(()=>pollNotices(g),document.hidden?60000:15000);
}
document.addEventListener('visibilitychange',()=>{if(user?.role==='moderator'&&document.hidden)scrubModeratorData();if(!document.hidden&&user){clearTimeout(noticeTimer);noticeGeneration++;if(user.role==='moderator')loadCurrent();pollNotices(noticeGeneration);}});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMobileMenu();if(e.key==='/'&&!uiBusy()&&user){const field=document.querySelector('input[name="q"]');if(field){e.preventDefault();field.focus();}}});
document.addEventListener('pointerdown',()=>{if(portalPrefs.sound&&audio?.state==='suspended')audio.resume().catch(()=>{});});
function skeleton(){return '<div class="skeleton-grid"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>';}
async function renderExtraView(v,id,signal){
 const target=document.querySelector('#content');let data;
 if(v==='dashboard')data=await api('dashboard',{signal});
 if(v==='products')data=await api('products?'+new URLSearchParams({page:productPage,q:productQuery}),{signal});
 if(v==='notifications')data=await api('notifications'+(noticeBefore?'?before='+noticeBefore:''),{signal});
 if(id!==loadId||!user||view!==v)return;
 if(v==='dashboard')renderDashboard(data,target);
 if(v==='products')renderProducts(data,target);
 if(v==='notifications')renderNotifications(data,target);
}
function renderDashboard(data,target){
 if(user?.role!=='admin')return;const t=data.totals,admin=true;
 const metrics=[['orders','Total orders',number(t.orders),`${number(t.today)} received today`],['money','Delivered order value',money(t.collected),'Not a payment-settlement report'],['trend','Open order value',money(t.pipeline),'Pending fulfilment, not collected'],['clock','Overdue callbacks',number(t.overdue),'Review the callback queue']];
 const today=new Date(data.asOf);const days=[];for(let i=6;i>=0;i--){const d=new Date(today.getTime()-i*86400000),key=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);days.push({day:key,label:new Intl.DateTimeFormat('en',{timeZone:'Asia/Dhaka',weekday:'short'}).format(d),count:Number(data.daily.find(x=>x.day===key)?.count||0)});}
 const max=Math.max(1,...days.map(d=>d.count)),points=days.map((d,i)=>`${20+i*100},${160-d.count/max*125}`),line=points.join(' '),area='20,175 '+line+' 620,175';
 target.innerHTML=`<div class="page-heading"><div><div class="eyebrow">${admin?'BUSINESS OVERVIEW':'MY ASSIGNED WORK'}</div><h1>${admin?'Your store, at a glance':'Your work, at a glance'}</h1><p>Live database totals &middot; ${esc(date(data.asOf))}</p></div><div class="button-row"><button class="btn secondary" id="dash-refresh">Refresh</button><button class="btn" id="dash-orders">${icon('orders')} ${admin?'Manage orders':'My orders'}</button></div></div><div class="stats summary">${metrics.map(([i,l,n,help])=>`<article class="stat"><div class="metric-icon">${icon(i)}</div><span>${l}</span><b>${n}</b><small>${help}</small></article>`).join('')}</div><div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h2>Order activity</h2><p>Last 7 days &middot; Bangladesh time</p></div><span class="badge new">${number(days.reduce((a,d)=>a+d.count,0))} orders</span></div><div class="chart"><svg viewBox="0 0 640 190" role="img" aria-label="${esc(days.map(d=>d.label+': '+d.count).join(', '))}"><path d="M20 50h600 M20 110h600 M20 175h600" stroke="#293d5c" fill="none"/><polygon points="${area}" fill="#3266c7" fill-opacity=".18"/><polyline points="${line}" stroke="#84b8ff" stroke-width="3" fill="none" stroke-linejoin="round"/>${days.map((d,i)=>`<circle cx="${20+i*100}" cy="${160-d.count/max*125}" r="4" fill="#a8ceff"/>`).join('')}</svg><div class="chart-labels">${days.map(d=>`<span>${d.label}</span>`).join('')}</div></div></section><section class="panel"><div class="panel-head"><div><h2>Needs your attention</h2><p>Move the next order forward</p></div>${icon('check')}</div><div class="queue-list">${(admin?[['neworders','New orders',t.new_orders,'orders'],['review','Confirmed orders',t.review,'check'],['callbacks','Overdue callbacks',t.overdue,'clock']]:[['orders','Calls to complete',t.to_call,'orders'],['callbacks','Overdue callbacks',t.overdue,'clock'],['orders','Delivered',t.delivered,'check']]).map(([v,l,n,i])=>`<button class="queue-row" data-queue="${v}"><span class="queue-title">${icon(i)} ${l}</span><b>${number(n)}</b></button>`).join('')}</div></section></div><section class="panel"><div class="panel-head"><div><h2>Recent orders</h2><p>${admin?'Latest activity across your store':'Only orders assigned to you'}</p></div><button class="btn secondary" id="recent-all">View all</button></div><div class="table-scroll"><table><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>PRODUCT</th><th>AMOUNT</th><th>STATUS</th><th></th></tr></thead><tbody>${data.recent.length?data.recent.map(o=>`<tr class="state-${esc(o.status)}"><td><b class="ref">ES-${esc(o.reference)}</b><small>${date(o.created_at)}</small></td><td>${esc(o.customer_name)}<small>${esc(o.district)}</small></td><td>${esc(o.product_name)} &times; ${number(o.quantity)}</td><td>${money(o.total)}</td><td>${badge(o.status)}</td><td><button class="row-open" data-recent="${o.id}">Open</button></td></tr>`).join(''):'<tr><td colspan="6"><div class="empty"><strong>No orders yet</strong>New orders will appear here after they are saved.</div></td></tr>'}</tbody></table></div></section>`;
 target.querySelector('#dash-refresh').onclick=()=>loadCurrent();target.querySelector('#dash-orders').onclick=target.querySelector('#recent-all').onclick=()=>navigate('orders');
 target.querySelectorAll('[data-queue]').forEach(b=>b.onclick=()=>navigate(b.dataset.queue));
 target.querySelectorAll('[data-recent]').forEach(b=>b.onclick=()=>openOrder(data.recent.find(o=>o.id===b.dataset.recent)));
}
function safeImage(url){try{if(/^\/(?:assets|uploads\/products)\/[A-Za-z0-9_./-]+$/.test(url)&&!url.includes('..'))return url;const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}}
function bindImages(target){target.querySelectorAll('img[data-safe-image]').forEach(img=>img.addEventListener('error',()=>{const fallback=document.createElement('span');fallback.textContent='Image unavailable';img.replaceWith(fallback);},{once:true}));}
function renderProducts(data,target){
 products=data.products;
 target.innerHTML=`<div class="page-heading"><div><div class="eyebrow">CATALOG & INVENTORY</div><h1>Products</h1><p>${number(data.total)} products &middot; prices in BDT &middot; stock reserved on order submission</p></div><div class="button-row"><a class="btn secondary" href="/shop" target="_blank" rel="noopener">View storefront</a><button class="btn" id="add-product">${icon('plus')} Add product</button></div></div><form class="product-search" id="product-search"><input name="q" aria-label="Search products" placeholder="Search name or SKU" value="${esc(productQuery)}"><button class="btn secondary" type="submit">Search</button></form><div class="product-grid">${products.length?products.map(product=>`<article class="product-card"><div class="product-image">${safeImage(product.image_url)?`<img data-safe-image src="${esc(safeImage(product.image_url))}" alt="${esc(product.name)}" loading="lazy" referrerpolicy="no-referrer">`:icon('box')}</div><div class="product-card-body"><div class="tag-line"><span class="badge ${product.active?'approved':'cancelled'}">${product.active?'Published':'Draft / inactive'}</span><span>${esc(product.sku)}</span>${product.id===data.landingProductId?'<span class="badge new">Main landing product</span>':''}</div><h3>${esc(product.name)}</h3><p class="${product.stock!==null&&product.stock<=5?'stock-low':''}">Stock: ${product.stock===null?'Unlimited':number(product.stock)+' available'}</p><div class="product-card-footer"><strong class="price">${money(product.price)}</strong><button class="btn secondary" data-product="${product.id}">Edit</button></div></div></article>`).join(''):'<div class="empty"><strong>No matching products</strong>Add your first product or clear the search.</div>'}</div><div class="pagination"><span>Page ${number(data.page)} / ${number(Math.max(1,Math.ceil(data.total/30)))}</span><div><button id="product-prev" class="btn secondary" ${data.page<=1?'disabled':''}>Previous</button><button id="product-next" class="btn secondary" ${data.page*30>=data.total?'disabled':''}>Next</button></div></div>`;
 target.querySelector('#add-product').onclick=()=>editProduct();target.querySelectorAll('[data-product]').forEach(b=>b.onclick=()=>editProduct(products.find(p=>p.id===b.dataset.product)));
 target.querySelector('#product-search').onsubmit=e=>{e.preventDefault();productQuery=new FormData(e.target).get('q');productPage=1;loadCurrent();};
 target.querySelector('#product-prev').onclick=()=>{productPage--;loadCurrent();};target.querySelector('#product-next').onclick=()=>{productPage++;loadCurrent();};bindImages(target);
}
function editProduct(product){
 const x=product||{name:'',sku:'',price:'',compare_at_price:0,stock:null,description:'',image_url:'',active:false};
 memberDialog.innerHTML=`<div class="dialog-head"><div><div class="eyebrow">CATALOG</div><h2 id="member-title">${product?'Edit product':'Add a product'}</h2></div><button class="close" aria-label="Close">&times;</button></div><div class="dialog-body"><form id="product-form" class="form-stack"><div class="form-grid"><label>Product name<input name="name" value="${esc(x.name)}" required minlength="2" maxlength="120"></label><label>SKU<input name="sku" value="${esc(x.sku)}" required minlength="2" maxlength="50" pattern="[A-Za-z0-9][A-Za-z0-9_-]+"></label><label>Price (whole BDT)<input name="price" type="number" min="1" max="1000000" step="1" value="${esc(x.price)}" required></label><label>Previous price (0 = none)<input name="compare_at_price" type="number" min="0" max="1000000" step="1" value="${esc(x.compare_at_price)}" required></label><label>Available stock<input name="stock" type="number" min="0" max="1000000" step="1" value="${x.stock===null?'':esc(x.stock)}" placeholder="Blank = unlimited"></label><label>Visibility<select name="active"><option value="false" ${!x.active?'selected':''}>Draft / inactive</option><option value="true" ${x.active?'selected':''}>Published</option></select></label><label class="wide">Image URL<input name="image_url" value="${esc(x.image_url)}" maxlength="1500" placeholder="https://... or /assets/product.webp"><span class="help">Use a URL, or choose an image below. JPG, PNG, WebP up to 2 MB; images stay in public/uploads/products.</span></label><label class="wide">Upload image<input type="file" id="product-image-file" accept="image/png,image/jpeg,image/webp"><span class="help" id="image-upload-status"></span></label><label class="wide">Description<textarea name="description" maxlength="3000">${esc(x.description)}</textarea></label></div><p class="help">Existing orders keep their original product name and price. Inactive products cannot receive new orders. Updating an order cancellation returns reserved stock once.</p><div class="form-actions"><button type="submit" class="btn">Save product</button><button type="button" class="btn secondary" data-close>Cancel</button></div><p class="error" role="alert"></p></form></div>`;
 memberDialog.querySelectorAll('.close,[data-close]').forEach(b=>b.onclick=()=>memberDialog.close());memberDialog.showModal();
 let uploading=0,uploadTicket=0;
 const imageFile=memberDialog.querySelector('#product-image-file');
 imageFile.onchange=async()=>{
  const file=imageFile.files[0],form=memberDialog.querySelector('form'),message=form.querySelector('#image-upload-status'),submit=form.querySelector('[type=submit]');
  if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2*1024*1024){message.textContent='Choose a PNG, JPEG or WebP image up to 2 MB.';imageFile.value='';return;}
  const ticket=++uploadTicket;uploading++;submit.disabled=true;message.textContent='Uploading image...';
  try{const image=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('Cannot read this image.'));reader.onload=()=>resolve(reader.result);reader.readAsDataURL(file);});
   const result=await api('upload',{method:'POST',body:JSON.stringify({image})});
   if(form.isConnected&&ticket===uploadTicket){form.elements.image_url.value=result.url;message.textContent='Image uploaded. Save the product to use it.';}
  }catch(e){if(form.isConnected)message.textContent=e.message;}finally{uploading--;submit.disabled=uploading>0;}
 };
 bindForm(memberDialog.querySelector('form'),async values=>{if(uploading)throw new Error('Wait for the image upload to finish.');const payload={...values,price:Number(values.price),compare_at_price:Number(values.compare_at_price),stock:values.stock===''?null:Number(values.stock),active:values.active==='true',...(product?{id:product.id,version:product.version}:{})};await api('products',{method:product?'PATCH':'POST',body:JSON.stringify(payload)});memberDialog.close();toast('Product saved.');await loadCurrent();});
}
function noticeTitle(n){return `ES-${n.reference}: ${n.kind==='created'?'New order':n.kind==='assigned'?'Order assigned':statusLabels[n.to_status]||'Order updated'}`;}
function renderNotifications(data,target){
 target.innerHTML=`<div class="page-heading"><div><div class="eyebrow">ACTIVITY CENTER</div><h1>Notifications</h1><p>${number(data.unread)} unread &middot; ${number(data.due)} overdue callbacks</p></div><div class="button-row"><button class="btn secondary" id="notification-settings">Sound & alerts</button><button class="btn" id="mark-read">Mark all read</button></div></div><section class="panel">${data.items.length?data.items.map(n=>`<article class="notice-item ${BigInt(n.id)>BigInt(data.readThrough)?'unread':''}"><span class="notice-icon">${icon(n.kind==='created'?'orders':n.kind==='assigned'?'users':'check')}</span><div class="notice-copy"><strong>${esc(noticeTitle(n))}</strong><p>${date(n.created_at)}</p></div><button class="row-open" data-notice-order="${n.order_id}">Open order</button></article>`).join(''):'<div class="empty"><strong>No notifications</strong>New orders and team activity will appear here.</div>'}<div class="pagination"><span>Recent activity is preserved in order history.</span><div><button class="btn secondary" id="notice-latest">Latest</button><button class="btn secondary" id="notice-older" ${!data.hasMore?'disabled':''}>Older</button></div></div></section>`;
 target.querySelector('#notification-settings').onclick=()=>navigate('settings');
 target.querySelector('#mark-read').onclick=async e=>{const b=e.currentTarget;b.disabled=true;try{await api('notifications',{method:'PATCH',body:JSON.stringify({through:data.latestId})});noticeData=null;document.querySelector('#notice-count').hidden=true;await loadCurrent();}catch(err){toast(err.message);b.disabled=false;}};
 target.querySelector('#notice-latest').onclick=()=>{noticeBefore='';loadCurrent();};target.querySelector('#notice-older').onclick=()=>{noticeBefore=data.items.at(-1).id;loadCurrent();};
 target.querySelectorAll('[data-notice-order]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const result=await api('orders?id='+encodeURIComponent(b.dataset.noticeOrder));if(!result.orders.length)throw new Error('This order is no longer assigned to you.');await openOrder(result.orders[0]);}catch(e){toast(e.message);}finally{b.disabled=false;}});
}
function addNotificationSettings(){
 if(view!=='settings'||user?.role!=='admin')return;const target=document.querySelector('#content');target.querySelector('#notification-preferences')?.remove();
 const section=document.createElement('section');section.className='panel settings-card security-card';section.id='notification-preferences';
 section.innerHTML=`<h2>Notifications & sound</h2><label class="preference-row"><span><strong>Order notification sound</strong><p>Plays after you enable sound and interact with this tab.</p></span><input type="checkbox" id="sound-preference" ${portalPrefs.sound?'checked':''}></label><div class="preference-row"><span><strong>Desktop alerts</strong><p>Optional browser permission. Customer details are never included.</p></span><button class="btn secondary" id="desktop-preference">${portalPrefs.desktop?'Turn off':'Enable'}</button></div><div class="button-row"><button class="btn secondary" id="test-sound">Test sound</button></div><p class="help">Activity checks run about every 15 seconds while this panel is visible. Browser throttling can delay them. Closing the panel stops checks; background push, SMS and email alerts are not configured.</p>`;
 target.append(section);section.querySelector('#sound-preference').onchange=async e=>{portalPrefs.sound=e.target.checked;savePrefs();syncSoundButton();if(portalPrefs.sound)await chime(true);};section.querySelector('#test-sound').onclick=()=>chime(true);
 section.querySelector('#desktop-preference').onclick=async()=>{if(portalPrefs.desktop){portalPrefs.desktop=false;savePrefs();addNotificationSettings();return;}if(!('Notification' in window)){toast('Desktop notifications are not supported by this browser.');return;}try{portalPrefs.desktop=await Notification.requestPermission()==='granted';savePrefs();addNotificationSettings();if(!portalPrefs.desktop)toast('Permission was not granted. In-panel notifications still work.');}catch{toast('This browser does not allow desktop notifications.');}};
}
function addOrderToolbar(){
 if(user?.role!=='admin')return;
 const h=document.querySelector('.page-heading');if(!h)return;const b=document.createElement('button');b.type='button';b.className='btn secondary';b.textContent='Export this page CSV';b.onclick=()=>{
  const cell=v=>'"'+String(v??'').replace(/^[\s]*([=+@-])/,'\'$1').replace(/"/g,'""')+'"';
  const rows=[['Reference','Product','Name','Phone','District','Quantity','Total BDT','Status'],...orders.map(o=>['ES-'+o.reference,o.product_name||'Ever Strong',o.customer_name,o.phone,o.district,o.quantity,o.total,o.status])];
  const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='orders-page-'+page+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };const row=document.createElement('div');row.className='button-row';const refresh=h.querySelector('#refresh');row.append(b);if(refresh)row.append(refresh);h.append(row);
}
document.addEventListener('DOMContentLoaded',async()=>{
 try{if(location.hash)history.replaceState(null,'',location.pathname);await startSession();}
 catch(e){if(!user){renderLogin();if(e.status!==401)document.querySelector('#login-form .error').textContent=e.message;}else{toast(e.message);}}
},{once:true});

for(const modal of [dialog,memberDialog]){modal.addEventListener('cancel',e=>{if(mutationBusy)e.preventDefault();});modal.addEventListener('click',e=>{if(mutationBusy&&e.target.closest('.close,[data-close]')){e.preventDefault();e.stopImmediatePropagation();}},true);}
