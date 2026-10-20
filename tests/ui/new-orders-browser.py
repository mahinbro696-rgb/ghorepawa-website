"""Admin new queue acceptance: real APIs/auth and disposable PGlite, never live Neon."""
import json,os,subprocess,shutil,uuid
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'.test-results/screenshots-new-orders';OUT.mkdir(parents=True,exist_ok=True)
env=dict(os.environ,GHOREPAWA_TEST_ONLY='1');env.pop('DATABASE_URL',None)
node=os.environ.get('NODE_TEST_BIN') or shutil.which('node')
proc=subprocess.Popen([node,'--experimental-test-module-mocks','tests/ui/workflow-server.mjs'],cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True)
errors=[]
try:
 config=json.loads(proc.stdout.readline());origin=config['origin'];password=config['password']
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_PATH'),args=['--no-sandbox'])
  def context(mobile=False):
   c=browser.new_context(viewport={'width':390,'height':844} if mobile else {'width':1580,'height':1050},reduced_motion='reduce' if mobile else 'no-preference')
   c.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,content_type='text/css',body=''));return c
  def login(c,username,role='admin'):
   page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.set_default_timeout(12000)
   page.goto(origin+('/admin' if role=='admin' else '/moderator'))
   page.locator('#login-form [name="username"]').fill(username);page.locator('#login-form [name="password"]').fill(password);page.locator('#login-form [type="submit"]').click()
   expect(page.locator('h1')).to_have_text('Your store, at a glance' if role=='admin' else 'My work inbox');return page
  ca=context();page=login(ca,'admin')
  def req(url,method='GET',data=None,status=200):
   r=ca.request.fetch(origin+'/api/'+url,method=method,data=data,headers={'Origin':origin,'Content-Type':'application/json'})
   assert r.status==status,(url,r.status,r.text());return r.json()
  for username in ['queue-alif','queue-rina']:req('team','POST',{'username':username,'name':username,'password':password},201)
  team=req('team')['members'];a=next(m for m in team if m['username']=='queue-alif');b=next(m for m in team if m['username']=='queue-rina')
  for m in [a,b]:req('team','PATCH',{'id':m['id'],'status':'active'})
  serial=0
  def place(name):
   global serial
   serial+=1;r=ca.request.post(origin+'/api/orders',data={'name':name,'phone':'01700000%03d'%serial,'district':'Dhaka','area':'Queue test area','address':'Example Road - TEST, DO NOT SHIP','quantity':1},headers={'Origin':origin,'Content-Type':'application/json','Idempotency-Key':str(uuid.uuid4())})
   assert r.status==201,r.text();ref=str(r.json()['reference']);return next(o for o in req('orders')['orders'] if str(o['reference'])==ref)
  first=place('Sample New Customer A');second=place('Sample New Customer B');left=place('Sample Waiting Customer');old=place('Already Assigned Customer')
  req('orders','PATCH',{'action':'assign','ids':[old['id']],'assignee':b['id']})
  # Dashboard shortcut, sidebar identity and locked filter constraints.
  page.locator('#dash-refresh').click();expect(page.locator('[data-queue="neworders"]')).to_be_visible();page.locator('[data-queue="neworders"]').click()
  expect(page.locator('h1')).to_have_text('New orders');expect(page.locator('.work-table [data-record-id]')).to_have_count(3)
  expect(page.locator('[data-view="neworders"]')).to_have_attribute('aria-current','page')
  expect(page.locator('#filter-form [name="status"]')).to_be_disabled();expect(page.locator('#filter-form [name="assignee"]')).to_be_disabled()
  assert req('orders')['total']==4
  page.screenshot(path=str(OUT/'admin-new-orders.png'),full_page=True,animations='disabled')
  # Live search/glow works in the new section and does not include existing assigned rows.
  field=page.locator('#filter-form [name="q"]');field.fill('Already');expect(page.locator('.work-table [data-record-id]')).to_have_count(0)
  expect(page.locator('.empty')).to_contain_text('No matching new orders');page.locator('#clear-search').click()
  expect(page.locator('.work-table [data-record-id]')).to_have_count(3)
  # Simulated assignment failure keeps the actual server data and current selections untouched.
  def fail_write(route):
   if route.request.method=='PATCH':route.fulfill(status=503,content_type='application/json',body='{"error":"Simulated assignment failure"}')
   else:route.continue_()
  page.route('**/api/orders',fail_write)
  page.locator('[data-select="'+first['id']+'"]').check();page.locator('[data-select="'+second['id']+'"]').check();page.locator('#bulk-assignee').select_option(a['id']);page.locator('#assign').click()
  expect(page.locator('#toast')).to_contain_text('Simulated assignment failure');expect(page.locator('.work-table [data-record-id]')).to_have_count(3)
  expect(page.locator('[data-select="'+first['id']+'"]').first).to_be_checked();assert req('orders?status=new&assignee=unassigned')['total']==3
  page.unroute('**/api/orders',fail_write)
  # Actual bulk assign: selected leave this queue, unselected stay, and All orders is unchanged.
  page.locator('#assign').click();expect(page.locator('.work-table [data-record-id]')).to_have_count(1)
  expect(page.locator('[data-record-id="'+left['id']+'"]').first).to_be_visible();expect(page.locator('#assign')).to_be_disabled()
  all_rows=req('orders');assert all_rows['total']==4
  for oid in [first['id'],second['id']]:assert next(o for o in all_rows['orders'] if o['id']==oid)['assigned_to']==a['id']
  page.screenshot(path=str(OUT/'new-orders-after-bulk-assign.png'),full_page=True,animations='disabled')
  page.locator('[data-view="orders"]').click();expect(page.locator('.work-table [data-record-id]')).to_have_count(4)
  expect(page.locator('[data-record-id="'+first['id']+'"] .staff-chip')).to_contain_text('queue-alif')
  page.screenshot(path=str(OUT/'all-orders-retained.png'),full_page=True,animations='disabled')
  cm=context();pm=login(cm,a['username'],'moderator');expect(pm.locator('.work-card')).to_have_count(2)
  expect(pm.locator('[data-view="neworders"]')).to_have_count(0);expect(pm.locator('[data-record-id="'+old['id']+'"]').first).to_have_count(0)
  page.locator('[data-view="neworders"]').click();expect(page.locator('.work-table [data-record-id]')).to_have_count(1)
  page.locator('#select-all').check();page.locator('#bulk-assignee').select_option(b['id']);page.locator('#assign').click()
  expect(page.locator('.work-table [data-record-id]')).to_have_count(0);expect(page.locator('.empty')).to_contain_text('No new orders waiting')
  assert req('orders')['total']==4;assert req('orders?status=new&assignee=unassigned')['total']==0
  # An arriving new order appears on next refresh; previous assignments never re-enter.
  incoming=place('Later Incoming Customer');page.locator('#refresh').click();expect(page.locator('.work-table [data-record-id]')).to_have_count(1)
  expect(page.locator('[data-record-id="'+incoming['id']+'"]').first).to_be_visible()
  # Deterministic pagination boundary: emulate a queue changing between page reads.
  pages=[]
  def last_page(route):
   from urllib.parse import urlparse,parse_qs
   q=parse_qs(urlparse(route.request.url).query);n=int(q.get('page',['1'])[0]);pages.append(n)
   assert q.get('status')==['new'] and q.get('assignee')==['unassigned']
   route.fulfill(status=200,content_type='application/json',body=json.dumps({'orders':[] if n>1 else [incoming],'total':1,'page':n,'pageSize':30,'stats':{'new':1}}))
  page.route('**/api/orders?**',last_page);page.evaluate('()=>{page=2; return loadCurrent();}')
  expect(page.locator('.work-table [data-record-id]')).to_have_count(1);assert pages[:2]==[2,1],pages
  page.unroute('**/api/orders?**',last_page)
  # Hidden/visible mobile navigation still exposes a usable queue, with no page overflow.
  small=context(True);ps=login(small,'admin');ps.locator('#menu-toggle').click();ps.locator('[data-view="neworders"]').click()
  expect(ps.locator('h1')).to_have_text('New orders');expect(ps.locator('.work-table [data-record-id]')).to_have_count(1)
  assert ps.evaluate('document.documentElement.scrollWidth<=innerWidth')
  ps.screenshot(path=str(OUT/'new-orders-mobile.png'),full_page=True,animations='disabled')
  browser.close()
 assert not errors,errors
 print('PASS new-order section, search, failed-assignment retention, selected-only bulk handoff, All orders preservation, moderator privacy, empty/refill queue, last-page recovery and mobile navigation.')
finally:
 proc.terminate()
 try:proc.wait(timeout=10)
 except subprocess.TimeoutExpired:proc.kill()
