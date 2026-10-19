"""Isolated browser regression tests. All API traffic is fulfilled by synthetic fixtures."""
import json, os, threading, shutil
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
class Static(SimpleHTTPRequestHandler):
    def __init__(self,*a,**kw):super().__init__(*a,directory=str(ROOT/'public'),**kw)
    def do_GET(self):
        if self.path.split('?')[0] in ['/admin','/moderator']:
            self.path='/admin/index.html'
        if self.path.split('?')[0]=='/shop':self.path='/shop/index.html'
        super().do_GET()
    def log_message(self,*a):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Static)
threading.Thread(target=server.serve_forever,daemon=True).start()
origin='http://127.0.0.1:'+str(server.server_port)
admin={'id':'admin-test','name':'Demo Administrator','role':'admin','username':'admin','twoFactorEnabled':False}
mod={'id':'mod-test','name':'Demo Moderator','role':'moderator','username':'moderator1','twoFactorEnabled':False}
landing='00000000-0000-4000-8000-000000000001'
product={'id':landing,'sku':'EVER-STRONG','name':'Ever Strong','description':'Sample catalog item for automated tests.','price':399,'compare_at_price':599,'stock':18,'active':True,'version':1,'image_url':'','created_at':'2026-10-19T12:00:00Z'}
orders=[{'id':'10000000-0000-4000-8000-%012d'%i,'reference':1000+i,'customer_name':name,'phone':'01700000001','district':'Dhaka','area':'Dhanmondi','address':'Synthetic test address only','quantity':i%3+1,'unit_price':399,'total':399*(i%3+1),'status':status,'assigned_name':'Demo Moderator','assigned_to':'mod-test','callback_at':None,'latest_note':'','version':1,'created_at':'2026-10-19T12:%02d:00Z'%i,'product_name':'Ever Strong'} for i,(name,status) in enumerate([('Sample Customer A','new'),('Sample Customer B','assigned'),('Sample Customer C','confirmed'),('Sample Customer D','approved'),('Sample Customer E','dispatched'),('Sample Customer F','delivered')],1)]
state={'role':'admin','signed':True,'products':[product.copy()],'notifications':[{'id':'8','order_id':orders[0]['id'],'kind':'created','to_status':'new','created_at':'2026-10-19T12:10:00Z','reference':'1001'}],'readThrough':'0','product_posts':0,'mutations':0}
errors=[];seen=[]
def route_api(route):
    req=route.request;u=urlparse(req.url);q=parse_qs(u.query);name=u.path.split('/')[-1];method=req.method;data=req.post_data_json if req.post_data else {};status=200;out={}
    seen.append((name,method))
    if name=='session':
        if method=='POST':
            if data.get('action')=='logout':state['signed']=False
            out={'ok':True}
        elif not state['signed']:status=401;out={'error':'Log in.'}
        else:out={'user':admin if state['role']=='admin' else mod}
    elif name=='login':state['signed']=True;out={'ok':True}
    elif name=='dashboard':out={'totals':{'orders':246,'today':18,'collected':'57240','pipeline':'14890','new_orders':12,'review':5,'delivered':146,'overdue':3,'to_call':8},'daily':[{'day':'2026-10-%02d'%day,'count':n,'value':str(n*399)} for day,n in zip(range(13,20),[12,18,9,24,17,31,18])],'recent':orders,'asOf':'2026-10-19T18:00:00Z'}
    elif name=='orders':
        selected=[o for o in orders if 'id' not in q or o['id']==q['id'][0]]
        out={'orders':selected,'total':len(selected),'page':1,'pageSize':30,'stats':{'new':12,'assigned':8,'confirmed':5,'approved':10,'delivered':146}}
    elif name=='team':out={'members':[dict(admin,status='active',total_orders=0,pending_orders=0,confirmed_orders=0),dict(mod,status='active',total_orders=19,pending_orders=8,confirmed_orders=11)]}
    elif name=='history':out={'events':[{'kind':'created','created_at':'2026-10-19T12:00:00Z','note':'','actor_name':None}]}
    elif name=='workhistory':out={'items':[],'page':1,'pageSize':30,'total':0}
    elif name=='security':out={'enabled':False}
    elif name=='notifications':
        if method=='PATCH':state['readThrough']=str(data['through']);out={'ok':True}
        else:out={'items':state['notifications'],'hasMore':False,'latestId':'8','unread':0 if state['readThrough']=='8' else 1,'readThrough':state['readThrough'],'due':3}
    elif name=='products':
        if method=='GET':out={'products':state['products'],'page':1,'pageSize':30,'total':len(state['products']),'landingProductId':landing}
        else:
            state['product_posts']+=1;product2=dict(data,id='20000000-0000-4000-8000-000000000001',version=1);state['products'].append(product2);out={'product':product2};status=201
    elif name=='catalog':out={'products':[product],'hasMore':False,'page':1,'landingProductId':landing}
    else:status=404;out={'error':'Unexpected mock endpoint: '+name}
    route.fulfill(status=status,content_type='application/json',body=json.dumps(out))
def start_page(browser,mobile=False):
    context=browser.new_context(viewport={'width':390,'height':844} if mobile else {'width':1440,'height':1040},reduced_motion='reduce' if mobile else 'no-preference')
    context.route('**/api/**',route_api)
    context.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(status=200,content_type='text/css',body=''))
    page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));return context,page
try:
 with sync_playwright() as p:
    executable=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium')
    browser=p.chromium.launch(headless=True,executable_path=executable,args=['--no-sandbox'])
    c,page=start_page(browser)
    page.goto(origin+'/admin');page.locator('h1',has_text='Your store, at a glance').wait_for()
    assert page.locator('.stats.summary .stat').count()==4
    out=Path(os.environ.get('PORTAL_SCREENSHOTS',str(ROOT/'.test-results/screenshots')));out.mkdir(parents=True,exist_ok=True)
    page.screenshot(path=str(out/'admin-dashboard.png'),full_page=True)
    page.locator('[data-view="orders"]').click();page.locator('#filter-form').wait_for()
    assert page.locator('[data-open]').count()==6
    # Admin-only compact sizing; moderator layout must not inherit these rules.
    assert page.locator('body').evaluate('(e)=>getComputedStyle(e).fontSize')=='14px'
    row=page.locator('.work-table tbody tr').first
    height=row.bounding_box()['height'];assert 48<=height<=96, height
    assert page.locator('.order-row-actions').first.evaluate('(e)=>getComputedStyle(e).display')=='flex'
    assert page.locator('.order-row-actions .delete-order-link').first.bounding_box()['width']>=32
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    print('PASS compact admin: 14px body; standard row height',height,'CSS px; aligned actions; no page overflow')
    page.screenshot(path=str(out/'admin-compact-orders.png'),full_page=True)
    # Assignment must not activate until both a task and a moderator are selected.
    first=page.locator('[data-select]').first
    first.check();assert page.locator('#assign').is_disabled()
    assert page.locator('.work-table .is-selected').count()==1
    page.locator('#bulk-assignee').select_option('mod-test');assert page.locator('#assign').is_enabled()
    page.locator('#bulk-assignee').select_option('');assert page.locator('#assign').is_disabled()
    first.uncheck();assert page.locator('.work-table .is-selected').count()==0
    # Cached reads must not reset their timestamp and keep disabled moderators forever.
    before=sum(n=='team' for n,m in seen)
    saved=page.evaluate('teamCacheAt')
    page.evaluate('async()=>{await loadCurrent();await loadCurrent();}')
    assert page.evaluate('teamCacheAt')==saved
    assert sum(n=='team' for n,m in seen)==before
    page.evaluate('async()=>{teamCacheAt=Date.now()-65000;await loadCurrent();}')
    assert sum(n=='team' for n,m in seen)==before+1
    print('PASS assignment guard, row selection and genuine 60-second team cache expiry')
    # Very long names/notes must not expand the table or execute injected markup.
    original=orders[0].copy();orders[0]['customer_name']='<img src=x onerror=alert(1)> '+('Long customer '*18)
    orders[0]['product_name']='Long product name '*25
    orders[0]['latest_note']='Call after lunch; verify the address. '*25
    page.evaluate('async()=>{await loadCurrent();}')
    assert page.locator('.order-customer img').count()==0
    assert page.locator('.work-table .call-note').first.bounding_box()['height']<=37
    assert page.locator('.work-table .cell-title').first.evaluate('(e)=>e.scrollWidth>e.clientWidth')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    orders[0].clear();orders[0].update(original);page.evaluate('async()=>{await loadCurrent();}')
    print('PASS long customer/product text, bounded note preview and HTML escaping')
    page.locator('[data-open]').first.click();page.locator('#order-dialog[open]').wait_for();page.locator('#history-content .history-item').wait_for()
    page.locator('#order-dialog .close').click()
    page.locator('[data-view="products"]').click();page.locator('#add-product').wait_for()
    page.locator('#add-product').click();page.locator('#product-form [name="name"]').fill('Test product');page.locator('#product-form [name="sku"]').fill('TEST-SKU')
    page.locator('#product-form [name="price"]').fill('1499');page.locator('#product-form [name="stock"]').fill('5');page.locator('#product-form [name="active"]').select_option('true')
    page.locator('#product-form [type="submit"]').click();page.locator('.product-card h3',has_text='Test product').wait_for();assert state['product_posts']==1
    page.screenshot(path=str(out/'admin-products.png'),full_page=True)
    page.locator('[data-view="notifications"]').click();page.locator('#mark-read').wait_for();page.locator('#mark-read').click();page.wait_for_function("document.querySelector('.page-heading p').textContent.includes('0') || document.querySelector('.page-heading p').textContent.includes('\u09e6')")
    assert state['readThrough']=='8'
    page.locator('[data-view="settings"]').click();page.locator('#notification-preferences').wait_for();page.locator('#test-sound').click()
    assert page.locator('#password-form').count()==1
    page.locator('[data-view="team"]').click();page.locator('#new-member').wait_for()
    page.locator('#logout').click();page.locator('#login-form').wait_for();assert not state['signed']
    print('PASS desktop: dashboard, orders, detail/history, products, notifications, settings, team, logout')
    state['signed']=True;state['role']='moderator';c.close();c,page=start_page(browser)
    page.goto(origin+'/moderator');page.locator('h1',has_text='My work inbox').wait_for();assert page.locator('[data-view="products"]').count()==0;assert page.locator('[data-view="team"]').count()==0
    page.locator('[data-view="orders"]').click();page.locator('#filter-form').wait_for();assert page.locator('#assign').count()==0
    assert page.locator('body').evaluate('(e)=>getComputedStyle(e).fontSize')=='17px'
    assert page.locator('body.admin-mode').count()==0
    print('PASS moderator: unchanged 17px UI, restricted menus and no admin bulk assignment')
    c.close();state['role']='admin';c,page=start_page(browser,mobile=True);page.goto(origin+'/admin');page.locator('.stats.summary').wait_for()
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    page.locator('#menu-toggle').click();page.locator('[data-view="products"]').click();page.locator('#add-product').wait_for();assert not page.locator('body').evaluate("el=>el.classList.contains('mobile-nav-open')")
    page.screenshot(path=str(out/'admin-mobile.png'),full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    page.locator('#menu-toggle').click();page.locator('[data-view="orders"]').click();page.locator('#filter-form').wait_for()
    assert page.locator('#filter-form input').evaluate('(e)=>parseFloat(getComputedStyle(e).fontSize)')>=16
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(out/'admin-compact-mobile.png'),full_page=True)
    print('PASS mobile: compact layout, usable 16px inputs, navigation, responsive width, reduced motion')
    c.close();c,page=start_page(browser);page.goto(origin+'/shop');page.locator('[data-buy]').wait_for();page.locator('[data-buy]').click();page.locator('#checkout-form').wait_for();assert page.locator('#checkout-total').inner_text()
    print('PASS public catalog: product list and checkout form')
    c.close();browser.close()
 assert not errors,errors
 print('PASS no uncaught browser JavaScript errors')
finally:server.shutdown()
