import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {randomBytes,randomUUID} from 'node:crypto';
import {hashPassword} from 'better-auth/crypto';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import QRCode from 'qrcode';
const db=new PGlite();
const pool={query:(sql,args)=>db.query(sql,args),connect:async()=>({query:(sql,args)=>db.query(sql,args),release(){}}),end:async()=>{}};
mock.module('../server/db.mjs',{namedExports:{getPool:()=>pool,transaction:async fn=>{await db.query('BEGIN');try{const result=await fn(pool);await db.query('COMMIT');return result;}catch(e){await db.query('ROLLBACK');throw e;}}}});
process.env.NODE_ENV='test';process.env.APP_ORIGIN='http://localhost:3000';process.env.BETTER_AUTH_SECRET=randomBytes(40).toString('hex');
const password=randomBytes(20).toString('base64url');process.env.ADMIN_INITIAL_PASSWORD_HASH=await hashPassword(password);
process.env.PORTAL_TEST_UPLOAD_DIR=await mkdtemp(path.join(os.tmpdir(),'portal-test-'));
let clients=0;
function client(){const cookies=new Map(),ip='127.0.0.'+(++clients);return async(url,method='GET',data,extra={})=>{
 const parsed=new URL(url,'http://localhost:3000'),{default:handler}=await import('../api/'+parsed.pathname.slice(5)+'.js');let code=200,out='',head={};
 const req={method,url,body:data,headers:{host:'localhost:3000',origin:'http://localhost:3000','content-type':'application/json',cookie:[...cookies].map(([k,v])=>k+'='+v).join('; '),...extra},socket:{remoteAddress:ip}};
 const res={setHeader(k,v){head[k.toLowerCase()]=v;},status(n){code=n;return this;},json(v){out=JSON.stringify(v);},end(v=''){out+=v;},write(v){out+=v;},destroy(){throw Error('Stream failure');}};
 await handler(req,res);for(const c of head['set-cookie']||[]){const part=c.split(';')[0],i=part.indexOf('=');cookies.set(part.slice(0,i),part.slice(i+1));}
 return {status:code,body:out?JSON.parse(out):null};
};}
const ok=(r,status=200)=>{assert.equal(r.status,status,JSON.stringify(r.body));return r.body;};
test('Glass Workflow v3: scoped work, callback handoff and explicit order erasure',async t=>{
 t.after(async()=>{await db.close();await rm(process.env.PORTAL_TEST_UPLOAD_DIR,{recursive:true,force:true});});
 const admin=client(),a=client(),b=client(),anon=client();
 ok(await admin('/api/setup'));ok(await admin('/api/login','POST',{username:'admin',password}));
 for(const username of ['alice-mod','bob-mod'])ok(await admin('/api/team','POST',{username,name:username,password}),201);
 let members=ok(await admin('/api/team')).members,alice=members.find(m=>m.username==='alice-mod'),bob=members.find(m=>m.username==='bob-mod');
 for(const m of [alice,bob])ok(await admin('/api/team','PATCH',{id:m.id,status:'active'}));
 ok(await a('/api/login','POST',{username:'alice-mod',password}));ok(await b('/api/login','POST',{username:'bob-mod',password}));
 const product=ok(await admin('/api/products','POST',{name:'Test stock',sku:'V3-STOCK',price:400,compare_at_price:0,stock:20,active:true,description:'',image_url:''}),201).product;
 let serial=10;
 async function place(options={}){
  const n=++serial,key=randomUUID(),payload={name:'Private Buyer '+n,phone:'01700000'+String(n).padStart(3,'0'),district:'Dhaka',area:'Test Area',address:'Private address '+n,quantity:1,productId:product.id,expectedUnitPrice:400,...options};
  const made=ok(await anon('/api/orders','POST',payload,{'idempotency-key':key}),201);
  const order=ok(await admin('/api/orders')).orders.find(o=>String(o.reference)===String(made.reference));return {order,key,payload};
 }
 const item=await place(),other=await place();
 const read=async id=>ok(await admin('/api/orders?id='+id)).orders[0];
 const assign=async(id,to)=>ok(await admin('/api/orders','PATCH',{action:'assign',ids:[id],assignee:to}));
 const submit=async(who,id,status,extra={})=>{const o=(await read(id));return who('/api/orders','PATCH',{action:'status',id,version:o.version,status,note:'Synthetic call note',...extra});};
 const erase=async(o,extra={})=>admin('/api/orders','DELETE',{id:o.id,reference:String(o.reference),version:o.version,confirmPermanentDelete:true,...extra});
 await t.test('migration is idempotent and staff badges are stable and distinct',async()=>{
  const {upgradeWorkflow}=await import('../server/workflow.mjs');await upgradeWorkflow();await upgradeWorkflow();
  assert.equal((await db.query('SELECT count(*)::int n FROM shop_schema WHERE version=4')).rows[0].n,1);
  assert(alice.badge_number&&bob.badge_number);assert.notEqual(alice.badge_number,bob.badge_number);
  assert.equal(ok(await admin('/api/team?compact=1')).members.find(m=>m.id===alice.id).badge_number,alice.badge_number);
 });
 await t.test('moderator inbox and APIs never reveal money or other moderator work',async()=>{
  await assign(item.order.id,alice.id);await assign(other.order.id,bob.id);
  const data=ok(await a('/api/orders?assignee='+bob.id));assert.equal(data.total,1);assert.equal(data.orders[0].id,item.order.id);
  for(const key of ['total','unit_price','request_key','fingerprint','assigned_name','confirmed_name','assigned_to','confirmed_by','phone_orders'])assert(!(key in data.orders[0]),key);
  assert.equal(ok(await a('/api/orders?id='+other.order.id)).total,0);
  assert.deepEqual(Object.keys(ok(await a('/api/dashboard'))),['work']);
  assert.equal((await a('/api/history?id='+item.order.id)).status,403);
  for(const url of ['/api/team','/api/team?compact=1','/api/products','/api/export'])assert.equal((await a(url)).status,403);
  assert.equal((await a('/api/orders','PATCH',{action:'assign',ids:[other.order.id],assignee:alice.id})).status,403);
 });
 const due=new Date(Date.now()+3600000).toISOString();
 await t.test('callback requires note and future time; no partial submission',async()=>{
  assert.equal((await submit(a,item.order.id,'callback',{note:'',callbackAt:due})).status,400);
  assert.equal((await submit(a,item.order.id,'callback',{callbackAt:'2000-01-01T00:00:00Z'})).status,400);
  assert.equal(ok(await a('/api/workhistory')).total,0);assert.equal(ok(await a('/api/orders')).total,1);
 });
 await t.test('callback hands PII to admin and keeps only an own minimal receipt',async()=>{
  ok(await submit(a,item.order.id,'callback',{note:'No answer - try later',callbackAt:due}));
  const o=await read(item.order.id);assert.equal(o.assigned_to,null);assert.equal(o.callback_customer,true);assert.equal(o.status,'callback');assert.equal(o.latest_note,'No answer - try later');
  assert.equal(ok(await a('/api/orders')).total,0);assert.equal(ok(await a('/api/orders?id='+o.id)).total,0);
  assert.equal(ok(await a('/api/notifications?tracked='+o.id)).accessibleIds.length,0);
  assert.equal((await a('/api/orders','PATCH',{action:'note',id:o.id,version:o.version,note:'Try to retain access'})).status,403);
  const h=ok(await a('/api/workhistory?member='+bob.id));assert.equal(h.total,1);
  assert.deepEqual(Object.keys(h.items[0]).sort(),['id','outcome','reference','submitted_at']);assert.equal(h.items[0].outcome,'callback');
  assert.equal(ok(await b('/api/workhistory?member='+alice.id)).total,0);
  assert.equal(ok(await admin('/api/orders?section=callbacks')).orders[0].id,o.id);
 });
 await t.test('callback reassignment preserves label, time and note across moderators',async()=>{
  await assign(item.order.id,bob.id);const o=await read(item.order.id);
  assert.equal(o.status,'callback');assert.equal(o.callback_customer,true);assert.equal(o.callback_at,due);assert.equal(o.latest_note,'No answer - try later');
  assert.equal(ok(await a('/api/orders')).total,0);assert.equal(ok(await b('/api/orders')).total,2);
  const theirs=ok(await b('/api/orders?id='+o.id)).orders[0];assert.equal(theirs.callback_customer,true);assert.equal(theirs.status,'callback');
  assert.equal(ok(await admin('/api/orders?section=callbacks')).total,1);
  ok(await submit(b,o.id,'callback',{callbackAt:due}));await assign(o.id,bob.id);ok(await submit(b,o.id,'callback',{callbackAt:due}));
  assert.equal(ok(await b('/api/workhistory')).total,2);await assign(o.id,bob.id);
 });
 await t.test('confirmation leaves inbox, records confirmer; only admin completes delivery',async()=>{
  ok(await submit(b,item.order.id,'confirmed'));const o=await read(item.order.id);
  assert.equal(o.assigned_to,null);assert.equal(o.confirmed_by,bob.id);assert.equal(o.confirmed_name,'bob-mod');
  assert.equal(ok(await b('/api/orders?id='+o.id)).total,0);assert.equal(ok(await admin('/api/orders?section=confirmed')).orders[0].id,o.id);
  assert.equal((await submit(b,o.id,'delivered')).status,403);
  assert.equal((await submit(admin,o.id,'delivered')).status,409);
  ok(await submit(admin,o.id,'dispatched'));ok(await submit(admin,o.id,'delivered'));
  assert.equal((await read(o.id)).status,'delivered');assert.equal(ok(await admin('/api/orders?section=confirmed')).orders[0].status,'delivered');
  assert.equal(ok(await b('/api/workhistory')).items[0].outcome,'confirmed');
 });
 let cancellation;
 await t.test('moderator cancellation moves to history/admin and releases stock only once',async()=>{
  cancellation=await place();await assign(cancellation.order.id,alice.id);
  const before=ok(await admin('/api/products')).products.find(p=>p.id===product.id).stock;
  ok(await submit(a,cancellation.order.id,'cancelled'));
  assert.equal((await read(cancellation.order.id)).assigned_to,null);assert.equal(ok(await a('/api/orders')).total,0);
  assert.equal(ok(await a('/api/workhistory')).items[0].outcome,'cancelled');
  assert.equal(ok(await admin('/api/products')).products.find(p=>p.id===product.id).stock,before+1);
  assert.equal((await submit(a,cancellation.order.id,'cancelled')).status,403);
  assert.equal(ok(await admin('/api/products')).products.find(p=>p.id===product.id).stock,before+1);
 });
 let target;
 await t.test('deletion requires admin, checkbox, matching reference and current version',async()=>{
  target=await place();await assign(target.order.id,alice.id);const o=await read(target.order.id);
  const payload={id:o.id,version:o.version,reference:String(o.reference),confirmPermanentDelete:true};
  assert.equal((await anon('/api/orders','DELETE',payload)).status,401);assert.equal((await a('/api/orders','DELETE',payload)).status,403);
  assert.equal((await erase(o,{confirmPermanentDelete:false})).status,400);assert.equal((await erase(o,{confirmPermanentDelete:'true'})).status,400);
  assert.equal((await erase(o,{reference:'not-this-order'})).status,400);assert.equal((await erase(o,{version:o.version-1})).status,409);
  assert(await read(o.id));assert.equal((await db.query('SELECT count(*)::int n FROM order_request_tombstones')).rows[0].n,0);
 });
 await t.test('erasure purges only the target from inbox, history, audit and notifications',async()=>{
  // Give this order a callback receipt, then reassign it, so both inbox and history are tested.
  ok(await submit(a,target.order.id,'callback',{callbackAt:due}));await assign(target.order.id,bob.id);
  const o=await read(target.order.id),before=ok(await admin('/api/products')).products.find(p=>p.id===product.id).stock;
  const keep=await place({phone:target.payload.phone});
  ok(await erase(o));assert.equal(ok(await admin('/api/orders?id='+o.id)).total,0);assert(await read(keep.order.id));
  assert.equal(ok(await b('/api/notifications?tracked='+o.id)).accessibleIds.length,0);
  assert(!ok(await a('/api/workhistory')).items.some(h=>String(h.reference)===String(o.reference)));
  assert(!ok(await admin('/api/notifications')).items.some(n=>n.order_id===o.id));
  for(const table of ['order_events','moderator_work_history'])assert.equal((await db.query(`SELECT count(*)::int n FROM ${table} WHERE order_id=$1`,[o.id])).rows[0].n,0);
  assert.equal(ok(await admin('/api/products')).products.find(p=>p.id===product.id).stock,before);
  const dump=ok(await admin('/api/export'));assert(!JSON.stringify(dump).includes(o.id));assert(!JSON.stringify(dump).includes(o.customer_name));
  assert.equal(dump.order_erasure_audit.length,1);assert.deepEqual(Object.keys(dump.order_erasure_audit[0]).sort(),['actor_id','erased_at','id']);
  assert.equal((await anon('/api/orders','POST',target.payload,{'idempotency-key':target.key})).status,410);
 });
 await t.test('delete cancelled history removes product order links; shipped erasure never restocks',async()=>{
  let o=await read(cancellation.order.id);ok(await erase(o));
  assert.equal((await db.query("SELECT count(*)::int n FROM product_events WHERE details->>'orderId'=$1",[o.id])).rows[0].n,0);
  const before=ok(await admin('/api/products')).products.find(p=>p.id===product.id).stock;
  o=await read(item.order.id);ok(await erase(o));assert.equal(ok(await admin('/api/products')).products.find(p=>p.id===product.id).stock,before);
  assert.equal(ok(await b('/api/workhistory')).total,0);
 });
 await t.test('row-bound erasure privilege expires; all other retention still holds',async()=>{
  assert.equal((await db.query("SELECT current_setting('ghorepawa.erase_order',true) AS setting")).rows[0].setting,'');
  for(const sql of ['DELETE FROM shop_orders','TRUNCATE shop_orders CASCADE','DELETE FROM team_members','DELETE FROM shop_products','TRUNCATE moderator_work_history','UPDATE order_events SET note=\'tamper\''])await assert.rejects(()=>db.query(sql));
  assert(await read(other.order.id));
 });
});
