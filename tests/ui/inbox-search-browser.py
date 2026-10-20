"""Isolated real API acceptance. Never connect to the live Ghorepawa database."""
from pathlib import Path
import json, os, re, shutil, subprocess, uuid
from datetime import datetime, timezone, timedelta
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'.test-results/screenshots-inbox-search'; OUT.mkdir(parents=True,exist_ok=True)
node=os.environ.get('NODE_TEST_BIN') or shutil.which('node')
env=dict(os.environ,GHOREPAWA_TEST_ONLY='1');env.pop('DATABASE_URL',None)
proc=subprocess.Popen([node,'--experimental-test-module-mocks','tests/ui/workflow-server.mjs'],cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True)
errors=[]
try:
 config=json.loads(proc.stdout.readline());origin=config['origin'];password=config['password']
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_PATH'),args=['--no-sandbox'])
  def context(mobile=False):
   c=browser.new_context(viewport={'width':390,'height':844} if mobile else {'width':1536,'height':1050},reduced_motion='reduce' if mobile else 'no-preference')
   c.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,content_type='text/css',body=''))
   return c
  def login(c,username,role):
   page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(origin+('/admin' if role=='admin' else '/moderator'))
   page.locator('#login-form [name="username"]').fill(username);page.locator('#login-form [name="password"]').fill(password);page.locator('#login-form [type="submit"]').click()
   expect(page.locator('h1')).to_have_text('Your store, at a glance' if role=='admin' else 'My work inbox')
   return page
  ca=context();pa=login(ca,'admin','admin')
  def request(c,url,method='GET',data=None,status=200):
   r=c.request.fetch(origin+'/api/'+url,method=method,data=data,headers={'Origin':origin,'Content-Type':'application/json'})
   assert r.status==status,(url,r.status,r.text());return r.json()
  for username in ['inbox-a','inbox-b']:request(ca,'team','POST',{'username':username,'name':username,'password':password},201)
  team=request(ca,'team')['members'];a=next(m for m in team if m['username']=='inbox-a');b=next(m for m in team if m['username']=='inbox-b')
  for m in [a,b]:request(ca,'team','PATCH',{'id':m['id'],'status':'active'})
  serial=0
  def place(name,address='12 Shared Lane',area='Dhanmondi'):
   global serial
   serial+=1
   r=ca.request.post(origin+'/api/orders',data={'name':name,'phone':'01700000%03d'%serial,'district':'Dhaka','area':area,'address':address,'quantity':1},headers={'Origin':origin,'Content-Type':'application/json','Idempotency-Key':str(uuid.uuid4())})
   assert r.status==201,r.text();ref=r.json()['reference'];return next(o for o in request(ca,'orders')['orders'] if str(o['reference'])==str(ref))
  nusrat=place('Nusrat Jahan');rahman=place('NUSRAT Rahman','45 Shared Lane');other=place('Other Operator Customer','Different Road')
  markup=place('<img src=x onerror=alert(1)> Test Buyer','Safe Literal Address')
  long=place('Very Long Customer Name '+('Example '*8),'A long delivery address with instructions','Long location name that should not expand the work row')
  for o in [nusrat,rahman,long]:request(ca,'orders','PATCH',{'action':'assign','ids':[o['id']],'assignee':a['id']})
  request(ca,'orders','PATCH',{'action':'assign','ids':[other['id']],'assignee':b['id']})
  cm=context();pm=login(cm,'inbox-a','moderator')
  # Compact rows rather than tall cards, preserving only the private assigned work.
  expect(pm.locator('.work-card')).to_have_count(3)
  assert pm.locator('[data-view]').count()==2
  assert pm.locator('.stats,.chart,#assign,[data-view="settings"]').count()==0
  assert 'Other Operator Customer' not in pm.locator('#content').inner_text()
  assert '\u09f3' not in pm.locator('#content').inner_text()
  assert pm.locator('.work-card').first.bounding_box()['height']<=125
  assert pm.locator('.task-identity h2',has_text='Very Long').evaluate('(e)=>e.scrollWidth>e.clientWidth')
  pm.screenshot(path=str(OUT/'moderator-compact-inbox.png'),full_page=True,animations='disabled')
  # Existing callback/handoff and history privacy remain functional with the compact markup.
  pm.locator('[data-open="'+rahman['id']+'"]').click();pm.locator('#order-update [name="status"]').select_option('callback')
  pm.locator('#order-update [name="note"]').fill('No answer; call in the afternoon.')
  pm.locator('#order-update [type="submit"]').click();expect(pm.locator('[data-record-id="'+rahman['id']+'"]').first).to_have_count(0)
  request(ca,'orders','PATCH',{'action':'assign','ids':[rahman['id']],'assignee':a['id']})
  pm.locator('#refresh').click();expect(pm.locator('.callback-customer')).to_contain_text('Call Back Later customer')
  expect(pm.locator('[data-record-id="'+rahman['id']+'"]')).to_contain_text('No answer')
  pm.screenshot(path=str(OUT/'moderator-callback-inbox.png'),full_page=True,animations='disabled')
  # Admin partial search: live typing, case independence, address, formatted phones and reference.
  pa.locator('[data-view="orders"]').click();expect(pa.locator('.work-table [data-record-id]')).to_have_count(5)
  def search(q,expected):
   pa.locator('#filter-form [name="q"]').fill(q)
   expect(pa.locator('#content')).not_to_have_class(re.compile('search-pending'),timeout=10000)
   expect(pa.locator('.work-table [data-record-id]')).to_have_count(expected)
   assert pa.locator('#filter-form [name="q"]').input_value()==q
  search('shared',2);expect(pa.locator('.search-summary')).to_contain_text('matches')
  assert pa.locator('mark.search-match').count()>=2
  assert pa.locator('#content.search-glow').count()==1
  assert pa.locator('.order-search-control').evaluate("(e)=>getComputedStyle(e,'::after').animationIterationCount")=='infinite'
  assert pa.locator('#filter-form [name="q"]').evaluate('(e)=>document.activeElement===e')
  pa.screenshot(path=str(OUT/'admin-partial-search.png'),full_page=True,animations='disabled')
  # Clicking elsewhere or pressing Escape stops glow and leaves search results in place.
  pa.locator('h1').click();assert pa.locator('#content.search-glow').count()==0
  pa.evaluate('async()=>{await loadCurrent({background:true});}')
  assert pa.locator('#content.search-glow').count()==0
  pa.locator('#filter-form [name="q"]').focus();assert pa.locator('#content.search-glow').count()==1
  pa.keyboard.press('Escape');assert pa.locator('#content.search-glow').count()==0
  search('Nusrat Dhaka',2)
  search('+88 '+nusrat['phone'][:5]+' '+nusrat['phone'][5:],1)
  search('es - '+str(nusrat['reference']),1)
  search('no-matching-person',0)
  # Literal markup matching cannot inject elements through highlight rendering.
  search('<img',1);assert pa.locator('.order-customer img').count()==0;assert pa.locator('.order-customer mark').count()>0
  # Debounced rapid edits issue only one final search request and retain caret/focus.
  seen=[]
  pa.on('request',lambda r:seen.append(r.url) if '/api/orders?' in r.url else None)
  field=pa.locator('#filter-form [name="q"]');field.fill('');field.press_sequentially('Nusrat',delay=30);field.press('Home');field.press('ArrowRight')
  expect(pa.locator('.work-table [data-record-id]')).to_have_count(2)
  assert field.evaluate('(e)=>e.selectionStart')==1
  queries=[u for u in seen if 'q=Nusrat&' in u];assert len(queries)==1,seen
  # A late older response must not overwrite the newer result or restart a dismissed glow.
  pa.evaluate("""()=>{window.savedFetch=window.fetch;window.fetch=async (...args)=>{const r=await savedFetch(...args);const u=new URL(args[0],location.origin);if(u.pathname==='/api/orders'&&u.searchParams.get('q')==='Shared')await new Promise(done=>setTimeout(done,900));return r;};}""")
  field.fill('Shared');pa.wait_for_timeout(450);field.fill('Different');field.press('Escape')
  expect(pa.locator('.work-table [data-record-id]')).to_have_count(1)
  expect(pa.locator('.work-table')).to_contain_text('Other Operator Customer')
  pa.wait_for_timeout(950);expect(pa.locator('.work-table')).to_contain_text('Other Operator Customer');assert pa.locator('#content.search-glow').count()==0
  pa.evaluate('()=>{window.fetch=window.savedFetch;}')
  # Temporary server errors retain the search form, do not show stale data as new matches, and can retry.
  pa.route('**/api/orders?**',lambda r:r.fulfill(status=503,content_type='application/json',body='{"error":"Temporary test failure"}'))
  field.fill('Retry');expect(pa.locator('.search-summary')).to_contain_text('Search failed')
  assert field.input_value()=='Retry';expect(pa.locator('.work-table [data-record-id]')).to_have_count(0)
  pa.unroute('**/api/orders?**');search('Nusrat',2)
  pa.locator('#clear-search').click();expect(pa.locator('.work-table [data-record-id]')).to_have_count(5)
  assert pa.locator('#filter-form [name="q"]').input_value()==''
  # Small screens stay compact, touchable, keyboard accessible and motion-aware.
  csmall=context(True);ps=login(csmall,'inbox-a','moderator')
  assert ps.evaluate('document.documentElement.scrollWidth <= innerWidth')
  assert ps.locator('input[name="q"]').evaluate('(e)=>parseFloat(getComputedStyle(e).fontSize)')>=16
  assert ps.locator('.work-card .btn').first.bounding_box()['height']>=44
  ps.screenshot(path=str(OUT/'moderator-compact-mobile.png'),full_page=True,animations='disabled')
  casmall=context(True);pas=login(casmall,'admin','admin');pas.locator('#menu-toggle').click();pas.locator('[data-view="orders"]').click()
  pas.locator('#filter-form [name="q"]').fill('Shared');expect(pas.locator('.work-table [data-record-id]')).to_have_count(2)
  assert pas.evaluate('document.documentElement.scrollWidth <= innerWidth')
  assert pas.locator('.order-search-control').evaluate("(e)=>getComputedStyle(e,'::after').animationName")=='none'
  pas.screenshot(path=str(OUT/'admin-search-mobile.png'),full_page=True,animations='disabled')
  browser.close()
 assert not errors,errors
 print('PASS moderator compact inbox, callbacks and privacy; real API partial admin search, Unicode/phone/reference, live debounce, focus/caret, late response cancellation, retry, glow dismissal, reduced motion and mobile layout.')
finally:
 proc.terminate()
 try:proc.wait(timeout=10)
 except subprocess.TimeoutExpired:proc.kill()
