'use strict';
// Search remains scoped by the server. No customer data is persisted in browser storage.
let adminSearchTimer=null,adminSearchPending=false,adminSearchGlow=false;
const searchViews=new Set(['orders','neworders','review','callbacks','unapproved']);
function dismissSearchGlow(){adminSearchGlow=false;syncSearchGlow();}
function syncSearchGlow(){
 const target=document.querySelector('#content');if(!target)return;
 target.classList.toggle('search-glow',!!(user?.role==='admin'&&searchViews.has(view)&&filter.q.trim()&&adminSearchGlow&&!adminSearchPending));
 const stop=target.querySelector('#stop-search-glow');if(stop)stop.hidden=!target.classList.contains('search-glow');
}
function searchBusy(busy){
 adminSearchPending=busy;
 const target=document.querySelector('#content');if(!target)return;
 target.classList.toggle('search-pending',busy);
 for(const el of target.querySelectorAll('.work-table,.bulk-bar,.pagination'))el.inert=busy;
 const status=target.querySelector('#search-result-count');if(busy&&status)status.textContent='Searching all matching orders...';
 syncSearchGlow();
}
function cancelAdminSearch(){
 clearTimeout(adminSearchTimer);adminSearchTimer=null;adminSearchGlow=false;searchBusy(false);
}
function searchSummary(){
 if(!filter.q.trim())return '';
 const start=total?(page-1)*30+1:0,end=Math.min(page*30,total);
 return `<div class="search-summary"><span id="search-result-count" role="status" aria-live="polite">${number(total)} matches for <strong>${esc(filter.q)}</strong> &middot; showing ${number(start)}&ndash;${number(end)}</span><button type="button" class="search-stop" id="stop-search-glow">Stop glow</button></div>`;
}
function highlightOrderMatch(value){
 const text=String(value??''),q=filter.q.trim();if(!q)return esc(text);
 const normalize=s=>s.replace(/[\u09e6-\u09ef]/g,c=>String(c.charCodeAt(0)-0x09e6)).toLowerCase();
 const source=normalize(text),terms=normalize(q).split(/\s+/).filter(Boolean);
 const covered=new Set();
 for(const term of terms){let start=0;while(term&&start<source.length){const found=source.indexOf(term,start);if(found<0)break;for(let i=found;i<found+term.length;i++)covered.add(i);start=found+term.length;}}
 // Escape every chunk. Search text never becomes raw HTML or a regular expression.
 let html='',chunk='',matched=false;
 for(let i=0;i<text.length;i++){const next=covered.has(i);if(next!==matched&&chunk){html+=matched?'<mark class="search-match">'+esc(chunk)+'</mark>':esc(chunk);chunk='';}matched=next;chunk+=text[i];}
 return html+(matched?'<mark class="search-match">'+esc(chunk)+'</mark>':esc(chunk));
}
function bindAdminSearch(target){
 const form=target.querySelector('#filter-form'),input=form.querySelector('[name="q"]');
 const clear=form.querySelector('#clear-search');let composing=false;
 const run=()=>{
  clearTimeout(adminSearchTimer);adminSearchTimer=null;
  if(!form.isConnected||user?.role!=='admin'||!searchViews.has(view))return;
  filter={q:'',status:'',assignee:'',...Object.fromEntries(new FormData(form))};
  filter.q=filter.q.trim().slice(0,100);page=1;selected.clear();
  searchBusy(true);loadCurrent({search:true});
 };
 form.onsubmit=e=>{e.preventDefault();adminSearchGlow=!!input.value.trim();run();};
 input.oninput=()=>{
  clearTimeout(adminSearchTimer);clear.hidden=!input.value;
  adminSearchGlow=!!input.value.trim();
  // Invalidate an older in-flight read immediately, not after the debounce timer.
  readController?.abort();loadId++;searchBusy(true);
  if(!composing)adminSearchTimer=setTimeout(run,350);
 };
 input.oncompositionstart=()=>{composing=true;clearTimeout(adminSearchTimer);};
 input.oncompositionend=()=>{composing=false;input.oninput();};
 input.onfocus=()=>{if(filter.q.trim()&&input.value.trim()===filter.q){adminSearchGlow=true;syncSearchGlow();}};
 form.querySelectorAll('select').forEach(select=>select.onchange=()=>{adminSearchGlow=!!input.value.trim();run();});
 clear.onclick=()=>{input.value='';clear.hidden=true;adminSearchGlow=false;run();input.focus({preventScroll:true});};
 const stop=target.querySelector('#stop-search-glow');if(stop)stop.onclick=dismissSearchGlow;
 syncSearchGlow();
}
document.addEventListener('pointerdown',event=>{
 if(!event.target.closest('#filter-form,#stop-search-glow'))dismissSearchGlow();
});
document.addEventListener('focusin',event=>{
 if(!event.target.closest('#filter-form,#stop-search-glow'))dismissSearchGlow();
});
document.addEventListener('keydown',event=>{if(event.key==='Escape')dismissSearchGlow();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)dismissSearchGlow();});

function showAdminSearchError(message){
 adminSearchGlow=false;orders=[];total=0;selected.clear();renderOrders({preserveSearch:true});
 const target=document.querySelector('#content'),status=target.querySelector('#search-result-count');
 if(status)status.textContent='Search failed. '+message+' Press Search to retry.';
 const body=target.querySelector('.work-table tbody');
 body.innerHTML='<tr><td colspan="8"><p class="empty" role="alert"></p></td></tr>';
 body.querySelector('p').textContent='Search could not be completed. Please try again.';
}
