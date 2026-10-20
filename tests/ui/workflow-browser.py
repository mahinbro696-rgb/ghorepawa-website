"""Real HTTP + real API + ephemeral PostgreSQL-compatible DB browser acceptance test.
No live hostname, customer credentials, production database or external API writes.
"""
import json, os, subprocess, shutil, uuid
from pathlib import Path
from datetime import datetime, timezone, timedelta
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'.test-results/screenshots-v3'; OUT.mkdir(parents=True,exist_ok=True)
node=os.environ.get('NODE_TEST_BIN') or shutil.which('node')
env=dict(os.environ,GHOREPAWA_TEST_ONLY='1');env.pop('DATABASE_URL',None)
proc=subprocess.Popen([node,'--experimental-test-module-mocks','tests/ui/workflow-server.mjs'],cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True)
errors=[]
try:
 config=json.loads(proc.stdout.readline());origin=config['origin'];password=config['password']
 with sync_playwright() as p:
  executable=os.environ.get('CHROMIUM_PATH')
  browser=p.chromium.launch(headless=True,executable_path=executable,args=['--no-sandbox'])
  def context(mobile=False):
   c=browser.new_context(viewport={'width':390,'height':844} if mobile else {'width':1580,'height':1100},reduced_motion='reduce' if mobile else 'no-preference')
   c.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,content_type='text/css',body=''))
   return c
  def login(c,username,role):
   page=c.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(origin+('/admin' if role=='admin' else '/moderator'))
   page.locator('#login-form [name="username"]').fill(username);page.locator('#login-form [name="password"]').fill(password);page.locator('#login-form [type="submit"]').click()
   expect(page.locator('h1')).to_have_text('Your store, at a glance' if role=='admin' else 'My work inbox')
   return page
  ca=context();pa=login(ca,'admin','admin')
  def request(c,url,method='GET',data=None,expected=200):
   response=c.request.fetch(origin+'/api/'+url,method=method,data=data,headers={'Origin':origin,'Content-Type':'application/json'})
   assert response.status==expected,(url,response.status,response.text());return response.json()
  def get_order(oid):return request(ca,'orders?id='+oid)['orders'][0]
  for username in ['operator-a','operator-b']:request(ca,'team','POST',{'name':username,'username':username,'password':password},201)
  team=request(ca,'team')['members'];a=next(m for m in team if m['username']=='operator-a');b=next(m for m in team if m['username']=='operator-b')
  for m in [a,b]:request(ca,'team','PATCH',{'id':m['id'],'status':'active'})
  serial=0
  def place(name):
   global serial
   serial+=1;payload={'name':name,'phone':'01700000%03d'%serial,'district':'Dhaka','area':'Test Area','address':'Sample address - never ship','quantity':1}
   response=ca.request.post(origin+'/api/orders',data=payload,headers={'Origin':origin,'Content-Type':'application/json','Idempotency-Key':str(uuid.uuid4())})
   assert response.status==201,response.text();reference=response.json()['reference'];return next(o for o in request(ca,'orders')['orders'] if str(o['reference'])==str(reference))
  o1=place('Sample Callback Customer');o2=place('Sample Assigned Customer')
  def assign(o,to):request(ca,'orders','PATCH',{'action':'assign','ids':[o['id']],'assignee':to})
  # Exercise actual bulk assignment controls for the first order.
  pa.locator('[data-view="orders"]').click();pa.locator('[data-select="'+o1['id']+'"]').check();pa.locator('#bulk-assignee').select_option(a['id']);pa.locator('#assign').click()
  expect(pa.locator('[data-record-id="'+o1['id']+'"] .staff-chip')).to_contain_text('operator-a')
  assign(o2,b['id'])
  cm1=context();pm1=login(cm1,'operator-a','moderator')
  assert pm1.locator('[data-view]').count()==2
  for v in ['dashboard','team','products','settings','notifications']:assert pm1.locator('[data-view="'+v+'"]').count()==0
  assert pm1.locator('.chart,.stats,#assign').count()==0
  assert 'Sample Assigned Customer' not in pm1.locator('body').inner_text()
  assert '\u09f3' not in pm1.locator('#content').inner_text()
  raw=request(cm1,'orders')['orders'][0];assert not any(k in raw for k in ['total','unit_price','assigned_name','fingerprint','request_key'])
  pm1.screenshot(path=str(OUT/'moderator-inbox.png'),full_page=True)
  pm1.locator('[data-open="'+o1['id']+'"]').click();expect(pm1.locator('#order-dialog')).to_be_visible()
  assert pm1.locator('#history-content,#delete-from-detail').count()==0
  pm1.locator('#order-update [name="status"]').select_option('callback');pm1.locator('#order-update [name="note"]').fill('No answer; please call tomorrow morning.')
  pm1.locator('#order-update [type="submit"]').click();expect(pm1.locator('[data-record-id="'+o1['id']+'"]')).to_have_count(0)
  pm1.locator('[data-view="workhistory"]').click();expect(pm1.locator('.receipt-table tbody')).to_contain_text('Call Back Later')
  for secret in [o1['customer_name'],o1['phone'],o1['address'],'No answer']:assert secret not in pm1.locator('#content').inner_text()
  assert pm1.locator('[data-open]').count()==0
  pm1.screenshot(path=str(OUT/'moderator-history.png'),full_page=True)
  pa.locator('[data-view="callbacks"]').click();expect(pa.locator('h1')).to_have_text('Call Back Later')
  expect(pa.locator('[data-record-id="'+o1['id']+'"]')).to_contain_text('No answer')
  pa.screenshot(path=str(OUT/'admin-callbacks.png'),full_page=True)
  pa.locator('[data-select="'+o1['id']+'"]').check();pa.locator('#bulk-assignee').select_option(b['id']);pa.locator('#assign').click()
  expect(pa.locator('[data-record-id="'+o1['id']+'"] .staff-chip')).to_contain_text('operator-b')
  assert get_order(o1['id'])['status']=='callback'
  cm2=context();pm2=login(cm2,'operator-b','moderator')
  expect(pm2.locator('[data-record-id="'+o1['id']+'"]')).to_contain_text('Call Back Later customer')
  pm2.locator('[data-open="'+o1['id']+'"]').click();pm2.locator('#order-update [name="status"]').select_option('confirmed');pm2.locator('#order-update [name="note"]').fill('Confirmed quantity and delivery details.');pm2.locator('#order-update [type="submit"]').click()
  expect(pm2.locator('[data-record-id="'+o1['id']+'"]')).to_have_count(0)
  pa.locator('[data-view="review"]').click();expect(pa.locator('[data-record-id="'+o1['id']+'"]')).to_have_class('state-confirmed')
  for status in ['dispatched','delivered']:
   pa.locator('[data-open="'+o1['id']+'"]').click();pa.locator('#order-update [name="status"]').select_option(status);pa.locator('#order-update [type="submit"]').click()
   expect(pa.locator('[data-record-id="'+o1['id']+'"]')).to_have_class('state-'+status)
  assert get_order(o1['id'])['status']=='delivered'
  # Open another assigned order on moderator side; deletion must remove that dialog even while typing.
  pm2.locator('[data-open="'+o2['id']+'"]').click();pm2.locator('#order-update [name="note"]').fill('Typing a note before access is revoked')
  pa.locator('[data-view="orders"]').click();pa.locator('[data-delete-order="'+o2['id']+'"]').click()
  expect(pa.locator('#confirm-delete')).to_be_disabled();pa.locator('[data-delete-close]').last.click();assert get_order(o2['id'])
  pa.locator('[data-delete-order="'+o2['id']+'"]').click();pa.screenshot(path=str(OUT/'admin-delete-warning.png'),full_page=True)
  pa.locator('#delete-consent').check();expect(pa.locator('#confirm-delete')).to_be_enabled();pa.locator('#confirm-delete').click();expect(pa.locator('[data-record-id="'+o2['id']+'"]')).to_have_count(0)
  expect(pm2.locator('#order-dialog')).not_to_be_visible(timeout=25000)
  assert 'Sample Assigned Customer' not in pm2.locator('body').inner_text()
  assert not request(cm2,'orders')['orders']
  # Four distinct status colors in the admin list.
  cb=place('Sample Yellow Callback');cf=place('Sample Purple Confirmed');cx=place('Sample Red Cancelled')
  def outcome(o,who,status):
   assign(o,who);c=cm1 if who==a['id'] else cm2;fresh=get_order(o['id'])
   data={'action':'status','id':o['id'],'version':fresh['version'],'status':status,'note':'Synthetic test result'}
   if status=='callback':data['callbackAt']=(datetime.now(timezone.utc)+timedelta(hours=2)).isoformat()
   request(c,'orders','PATCH',data)
  outcome(cb,a['id'],'callback');outcome(cf,b['id'],'confirmed');outcome(cx,a['id'],'cancelled')
  pa.locator('#refresh').click();expect(pa.locator('.state-cancelled')).to_have_count(1)
  colors=[pa.locator('.state-'+s+' td').first.evaluate('(e)=>getComputedStyle(e).backgroundColor') for s in ['delivered','callback','confirmed','cancelled']];assert len(set(colors))==4
  assert pa.locator('body').evaluate('(e)=>parseFloat(getComputedStyle(e).fontSize)')==14
  assert pm1.locator('body').evaluate('(e)=>parseFloat(getComputedStyle(e).fontSize)')>=15
  pa.screenshot(path=str(OUT/'admin-glass-orders.png'),full_page=True)
  pa.locator('[data-view="team"]').click();expect(pa.locator('.team-grid')).to_be_visible()
  chips=pa.locator('.member-header .staff-chip');assert chips.count()==2
  assert chips.nth(0).get_attribute('class')!=chips.nth(1).get_attribute('class')
  # Mobile layout, title, large fields, no page overflow.
  csmall=context(True);ps=login(csmall,'admin','admin');ps.locator('#menu-toggle').click();ps.locator('[data-view="orders"]').click();expect(ps.locator('#filter-form')).to_be_visible()
  assert ps.evaluate('document.documentElement.scrollWidth <= innerWidth'),ps.evaluate('[document.documentElement.scrollWidth,innerWidth]')
  ps.screenshot(path=str(OUT/'admin-mobile.png'),full_page=True)
  fresh=place('Sample Mobile Task');assign(fresh,a['id']);cmodsmall=context(True);pms=login(cmodsmall,'operator-a','moderator')
  assert pms.evaluate('document.documentElement.scrollWidth <= innerWidth')
  assert pms.locator('input[name="q"]').evaluate('(e)=>parseFloat(getComputedStyle(e).fontSize)')>=16
  pms.screenshot(path=str(OUT/'moderator-mobile.png'),full_page=True)
  browser.close()
 assert not errors,errors
 print('PASS real HTTP browser acceptance: admin/moderator login, isolated inbox, callback handoff/reassignment, minimal history, courier/complete, consent deletion, cross-session revocation, status colors, staff badges, compact admin fonts, compact moderator fonts and mobile layout.')
finally:
 proc.terminate()
 try:proc.wait(timeout=10)
 except subprocess.TimeoutExpired:proc.kill()
