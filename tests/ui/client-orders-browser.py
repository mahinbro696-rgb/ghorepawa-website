"""Client acceptance: real APIs/auth on disposable SQL, never production data."""
import json,os,subprocess,shutil,uuid,re
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'.test-results/client-orders';OUT.mkdir(parents=True,exist_ok=True)
node=os.environ.get('NODE_TEST_BIN') or shutil.which('node')
env=dict(os.environ,GHOREPAWA_TEST_ONLY='1');env.pop('DATABASE_URL',None)
proc=subprocess.Popen([node,'--experimental-test-module-mocks','tests/ui/workflow-server.mjs'],cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True)
errors=[]
try:
 cfg=json.loads(proc.stdout.readline());origin=cfg['origin'];password=cfg['password']
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_PATH'),args=['--no-sandbox'])
  def context(mobile=False):
   c=browser.new_context(viewport={'width':390,'height':844} if mobile else {'width':1560,'height':1100},reduced_motion='reduce' if mobile else 'no-preference')
   c.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,content_type='text/css',body=''));return c
  def login(c,username,moderator=False):
   page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.set_default_timeout(14000)
   page.goto(origin+('/moderator' if moderator else '/admin'));expect(page.locator('#login-form')).to_be_visible()
   assert page.locator('html').get_attribute('lang')=='en'
   assert not re.search('[\u0980-\u09ff]',page.locator('body').inner_text())
   page.locator('[name="username"]').fill(username);page.locator('[name="password"]').fill(password);page.locator('#login-form [type="submit"]').click()
   expect(page.locator('h1')).to_have_text('My work inbox' if moderator else 'Your store, at a glance');return page
  ca=context();pa=login(ca,'admin')
  def req(c,name,method='GET',data=None,expected=200):
   res=c.request.fetch(origin+'/api/'+name,method=method,data=data,headers={'Origin':origin,'Content-Type':'application/json'})
   assert res.status==expected,(name,res.status,res.text());return res.json()
  def row(oid):return req(ca,'orders?id='+oid)['orders'][0]
  for username in ['client-operator-a','client-operator-b']:req(ca,'team','POST',{'username':username,'name':username,'password':password},201)
  staff=req(ca,'team')['members'];a=next(m for m in staff if m['username']=='client-operator-a');b=next(m for m in staff if m['username']=='client-operator-b')
  for m in [a,b]:req(ca,'team','PATCH',{'id':m['id'],'status':'active'})
  serial=0
  def place(name):
   global serial
   serial+=1;data={'name':name,'phone':'01720000%03d'%serial,'district':'Dhaka','area':'Example Area','address':'Synthetic test address - do not ship','quantity':1}
   res=ca.request.post(origin+'/api/orders',data=data,headers={'Origin':origin,'Content-Type':'application/json','Idempotency-Key':str(uuid.uuid4())})
   assert res.status==201,res.text();ref=res.json()['reference'];return next(o for o in req(ca,'orders')['orders'] if str(o['reference'])==str(ref))
  one=place('Sample for operator A');two=place('Sample bulk task');third=place('Sample for operator B');confirm=place('Sample direct confirmation');cancel=place('Sample cancellation')
  pa.locator('[data-view="orders"]').click();expect(pa.locator('.work-table tbody tr')).to_have_count(5)
  # All orders: choose target first, then select rows; failure preserves selections and shows inline feedback.
  pa.locator('#bulk-assignee').select_option(a['id'])
  for o in [one,two]:pa.locator('[data-select="'+o['id']+'"]').check()
  expect(pa.locator('#assign')).to_be_enabled()
  failed={'once':True}
  def fail_once(route):
   if route.request.method=='PATCH' and failed['once']:
    failed['once']=False;route.fulfill(status=409,content_type='application/json',body=json.dumps({'error':'Test conflict: refresh before assigning.'}))
   else:route.continue_()
  pa.route('**/api/orders',fail_once);pa.locator('#assign').click()
  expect(pa.locator('#assignment-error')).to_contain_text('Test conflict');expect(pa.locator('[data-select="'+one['id']+'"]').first).to_be_checked()
  expect(pa.locator('#assign')).to_be_enabled();pa.unroute('**/api/orders',fail_once);pa.locator('#assign').click()
  expect(pa.locator('[data-record-id="'+one['id']+'"] .staff-chip')).to_contain_text('client-operator-a')
  assert row(one['id'])['status']=='assigned' and row(two['id'])['assigned_to']==a['id']
  assert row(third['id'])['status']=='new'
  # Per-order assignment is an additional working entry point.
  pa.locator('[data-open="'+third['id']+'"]').click();pa.locator('#detail-assign-form select').select_option(b['id']);pa.locator('#detail-assign-form [type="submit"]').click()
  expect(pa.locator('#order-dialog')).not_to_be_visible();assert row(third['id'])['assigned_to']==b['id']
  # New -> Confirm from admin, then direct Complete without a courier prerequisite.
  pa.locator('[data-open="'+confirm['id']+'"]').click()
  expect(pa.locator('[data-status-choice="confirmed"]')).to_be_visible();expect(pa.locator('[data-status-choice="delivered"]')).to_be_visible();expect(pa.locator('[data-status-choice="cancelled"]')).to_be_visible()
  pa.screenshot(path=str(OUT/'admin-outcome-controls.png'),full_page=True)
  pa.locator('[data-status-choice="confirmed"]').click();expect(pa.locator('#order-update [type="submit"]')).to_have_text('Confirm order');pa.locator('#order-update [type="submit"]').click()
  expect(pa.locator('[data-record-id="'+confirm['id']+'"]').first).to_have_class('state-confirmed');assert row(confirm['id'])['status']=='confirmed'
  pa.locator('[data-view="review"]').click();expect(pa.locator('[data-record-id="'+confirm['id']+'"]').first).to_be_visible()
  pa.locator('[data-open="'+confirm['id']+'"]').click();pa.locator('[data-status-choice="delivered"]').click();expect(pa.locator('#order-update [type="submit"]')).to_have_text('Complete order');pa.locator('#order-update [type="submit"]').click()
  expect(pa.locator('[data-record-id="'+confirm['id']+'"]').first).to_have_count(0)
  pa.locator('[data-view="completed"]').click();expect(pa.locator('h1')).to_have_text('Completed orders');expect(pa.locator('.state-delivered')).to_have_count(1)
  # Cancel is not the dialog's Close action; reason is required, row appears red in Cancelled.
  pa.locator('[data-view="orders"]').click();pa.locator('[data-open="'+cancel['id']+'"]').click();pa.locator('[data-status-choice="cancelled"]').click()
  expect(pa.locator('#order-update [name="note"]')).to_have_attribute('required','')
  pa.locator('#order-update [type="submit"]').click();expect(pa.locator('#order-dialog')).to_be_visible();assert row(cancel['id'])['status']=='new'
  pa.locator('#order-update [name="note"]').fill('Customer declined the order.');pa.locator('#order-update [type="submit"]').click()
  expect(pa.locator('#order-dialog')).not_to_be_visible();assert row(cancel['id'])['status']=='cancelled'
  pa.locator('[data-view="unapproved"]').click();expect(pa.locator('h1')).to_have_text('Cancelled orders');expect(pa.locator('.state-cancelled')).to_have_count(1);expect(pa.locator('.state-delivered')).to_have_count(0)
  pa.screenshot(path=str(OUT/'admin-cancelled-orders.png'),full_page=True)
  pa.locator('[data-view="orders"]').click();expect(pa.locator('[data-stat="cancelled"]')).to_contain_text('1');expect(pa.locator('[data-stat="delivered"]')).to_contain_text('1')
  assert not re.search('[\u0980-\u09ff]',pa.locator('body').inner_text())
  # Moderator all-list explicitly broadens read access, not write authority.
  cm=context();pm=login(cm,a['username'],True);expect(pm.locator('[data-record-id="'+one['id']+'"]').first).to_be_visible();expect(pm.locator('[data-record-id="'+third['id']+'"]').first).to_have_count(0)
  pm.locator('[data-view="allorders"]').click();expect(pm.locator('h1')).to_have_text('All orders');expect(pm.locator('.shared-orders tbody tr')).to_have_count(5)
  for o in [confirm,cancel,third]:expect(pm.locator('[data-record-id="'+o['id']+'"]').first).to_be_visible()
  assert pm.locator('#assign,[data-select],.chart,[data-view="settings"]').count()==0
  assert 'BDT' not in pm.locator('#content').inner_text()
  pm.screenshot(path=str(OUT/'moderator-all-orders.png'),full_page=True)
  pm.locator('[data-open="'+third['id']+'"]').click();expect(pm.locator('.readonly-notice')).to_be_visible();assert pm.locator('#order-update,#delete-from-detail,#history-content,#detail-assign-form').count()==0
  fresh=row(third['id']);req(cm,'orders','PATCH',{'action':'status','id':fresh['id'],'version':fresh['version'],'status':'cancelled','note':'Forbidden'},403)
  pm.locator('[data-close]').first.click();pm.locator('#shared-order-search [name="q"]').fill('cancellation');pm.locator('#shared-order-search [type="submit"]').click();expect(pm.locator('.shared-orders tbody [data-record-id]')).to_have_count(1)
  expect(pm.locator('[data-record-id="'+cancel['id']+'"]').first).to_be_visible()
  # English settings and team text, without changing customer records.
  for v in ['team','settings']:
   pa.locator('[data-view="'+v+'"]').click();expect(pa.locator('#new-member' if v=='team' else '#notification-preferences')).to_be_visible();assert not re.search('[\u0980-\u09ff]',pa.locator('body').inner_text())
  # Mobile all-list scroll is contained within its own table, not the document.
  cs=context(True);ps=login(cs,a['username'],True);ps.locator('#menu-toggle').click();ps.locator('[data-view="allorders"]').click();expect(ps.locator('.shared-orders')).to_be_visible()
  assert ps.evaluate('document.documentElement.scrollWidth<=innerWidth')
  assert ps.locator('[name="q"]').evaluate('(e)=>parseFloat(getComputedStyle(e).fontSize)')>=16
  ps.screenshot(path=str(OUT/'moderator-all-orders-mobile.png'),full_page=True)
  browser.close()
 assert not errors,errors
 print('PASS client acceptance: All orders bulk/per-order assignment, failed-write feedback, direct admin Confirm/Complete/Cancel, separate terminal queues, English UI and messages, moderator shared read-only listing with write denial, mobile layout.')
finally:
 proc.terminate()
 try:proc.wait(timeout=10)
 except subprocess.TimeoutExpired:proc.kill()
