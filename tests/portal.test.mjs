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
test('portal products, inventory, notifications, uploads and role boundaries',async t=>{
 t.after(async()=>{await db.close();await rm(process.env.PORTAL_TEST_UPLOAD_DIR,{recursive:true,force:true});});
 const admin=client(),anon=client(),mod=client(),other=client();
 ok(await admin('/api/setup'));ok(await admin('/api/login','POST',{username:'admin',password}));
 let product,firstOrder,defaultOrder,moderator;
 const definition={name:'Sample Item',sku:'SAMPLE-01',price:900,compare_at_price:1200,stock:2,active:false,image_url:'',description:'Synthetic integration test'};
 const payload={name:'Test Buyer',phone:'01700000001',district:'Dhaka',area:'Test Area',address:'Test address - never ship',quantity:2,total:1};
 let firstKey=randomUUID();
 await t.test('migration is idempotent and public catalog has the original product',async()=>{
  const {upgradePortal}=await import('../server/products.mjs');await upgradePortal();await upgradePortal();
  const catalog=ok(await anon('/api/catalog'));assert.equal(catalog.products.length,1);assert.equal(catalog.products[0].price,399);
  assert.equal((await db.query('SELECT count(*)::int n FROM shop_schema WHERE version=3')).rows[0].n,1);
 });
 await t.test('only admin can manage products, drafts stay private',async()=>{
  assert.equal((await anon('/api/products')).status,401);
  product=ok(await admin('/api/products','POST',definition),201).product;
  assert.equal(ok(await anon('/api/catalog')).products.length,1);
  assert.equal((await admin('/api/products','POST',definition)).status,409);
  product=ok(await admin('/api/products','PATCH',{...product,active:true}),200).product;
  assert.equal(ok(await anon('/api/catalog')).products.length,2);
  assert.equal((await admin('/api/products','PATCH',{...product,version:product.version-1})).status,409);
 });
 await t.test('orders use catalog price, reserve stock and keep immutable snapshots',async()=>{
  const order=ok(await anon('/api/orders','POST',{...payload,productId:product.id,expectedUnitPrice:900},{'idempotency-key':firstKey}),201);
  assert.equal(order.total,1800);firstOrder=ok(await admin('/api/orders')).orders[0];assert.equal(firstOrder.product_name,'Sample Item');
  product=ok(await admin('/api/products')).products.find(x=>x.id===product.id);assert.equal(product.stock,0);
  const retry=ok(await anon('/api/orders','POST',{...payload,productId:product.id,expectedUnitPrice:900},{'idempotency-key':firstKey}));assert.equal(retry.reference,order.reference);
  assert.equal((await anon('/api/orders','POST',{...payload,productId:product.id,expectedUnitPrice:900},{'idempotency-key':randomUUID()})).status,409);
  assert.equal((await anon('/api/orders','POST',{...payload,quantity:1,productId:product.id,expectedUnitPrice:900},{'idempotency-key':firstKey})).status,409);
  await assert.rejects(()=>db.query("UPDATE shop_orders SET product_name='tampered' WHERE id=$1",[firstOrder.id]));
  await assert.rejects(()=>db.query('UPDATE shop_orders SET total=1 WHERE id=$1',[firstOrder.id]));
 });
 await t.test('price changes do not alter old receipts and stale prices are rejected',async()=>{
  product=ok(await admin('/api/products','PATCH',{...product,price:1000,stock:3})).product;
  assert.equal(ok(await admin('/api/orders')).orders[0].total,1800);
  assert.equal(ok(await anon('/api/orders','POST',{...payload,productId:product.id,expectedUnitPrice:900},{'idempotency-key':firstKey})).total,1800);
  assert.equal((await anon('/api/orders','POST',{...payload,phone:'01700000002',productId:product.id,expectedUnitPrice:900},{'idempotency-key':randomUUID()})).status,409);
 });
 await t.test('cancellation returns inventory only once',async()=>{
  ok(await admin('/api/orders','PATCH',{action:'status',id:firstOrder.id,version:firstOrder.version,status:'cancelled',note:'Integration test cancellation'}));
  product=ok(await admin('/api/products')).products.find(x=>x.id===product.id);assert.equal(product.stock,5);
  assert.equal((await admin('/api/orders','PATCH',{action:'status',id:firstOrder.id,version:firstOrder.version,status:'cancelled',note:'retry'})).status,409);
  assert.equal(ok(await admin('/api/products')).products.find(x=>x.id===product.id).stock,5);
 });
 await t.test('legacy landing checkout still charges original server price',async()=>{
  ok(await anon('/api/orders','POST',{...payload,phone:'01700000003',quantity:1},{'idempotency-key':randomUUID()}),201);
  defaultOrder=ok(await admin('/api/orders')).orders[0];assert.equal(defaultOrder.total,399);assert.equal(defaultOrder.product_name,'Ever Strong');
 });
 await t.test('moderators only see their own orders, dashboard and notifications',async()=>{
  for(const username of ['mod01','mod02'])ok(await admin('/api/team','POST',{username,name:username,password}),201);
  const members=ok(await admin('/api/team?compact=1')).members.filter(x=>x.role==='moderator');moderator=members.find(x=>x.username==='mod01');
  for(const m of members)ok(await admin('/api/team','PATCH',{id:m.id,status:'active'}));
  ok(await mod('/api/login','POST',{username:'mod01',password}));ok(await other('/api/login','POST',{username:'mod02',password}));
  assert.equal((await mod('/api/products')).status,403);assert.equal((await mod('/api/products','POST',{...definition,sku:'FORBIDDEN'})).status,403);
  ok(await admin('/api/orders','PATCH',{action:'assign',ids:[defaultOrder.id],assignee:moderator.id}));
  assert.equal(ok(await other('/api/orders?id='+defaultOrder.id)).total,0);assert.equal(ok(await other('/api/dashboard')).totals.orders,0);
  assert.equal(ok(await mod('/api/dashboard')).totals.orders,1);
  assert(ok(await mod('/api/notifications')).items.every(n=>n.order_id===defaultOrder.id));assert.equal(ok(await other('/api/notifications')).items.length,0);
  defaultOrder=ok(await mod('/api/orders')).orders[0];
  assert.equal((await mod('/api/orders','PATCH',{action:'status',id:defaultOrder.id,version:defaultOrder.version,status:'approved',note:'No privilege'})).status,409);
 });
 await t.test('unread state persists and old clients cannot move it backwards',async()=>{
  const before=ok(await admin('/api/notifications'));assert(before.unread>0);
  ok(await admin('/api/notifications','PATCH',{through:before.latestId}));assert.equal(ok(await admin('/api/notifications')).unread,0);
  ok(await admin('/api/notifications','PATCH',{through:'0'}));assert.equal(ok(await admin('/api/notifications')).unread,0);
  ok(await mod('/api/orders','PATCH',{action:'status',id:defaultOrder.id,version:defaultOrder.version,status:'confirmed',note:'Test confirmation'}));
  assert.equal(ok(await admin('/api/notifications')).unread,1);
  assert.equal((await mod('/api/notifications?before=bad')).status,400);
 });
 await t.test('uploads require admin and validate real image format',async()=>{
  assert.equal((await anon('/api/upload','POST',{image:''})).status,401);assert.equal((await mod('/api/upload','POST',{image:''})).status,403);
  assert.equal((await admin('/api/upload','POST',{image:'data:image/svg+xml;base64,PHN2Zz4='})).status,400);
  const image=await QRCode.toDataURL('Synthetic product upload test');const uploaded=ok(await admin('/api/upload','POST',{image}),201);
  assert.match(uploaded.url,/^\/uploads\/products\/[0-9a-f-]+\.png$/);
  assert((await readFile(path.join(process.env.PORTAL_TEST_UPLOAD_DIR,path.basename(uploaded.url)))).length>16);
 });
 await t.test('export includes products but no credentials and business deletion stays blocked',async()=>{
  const snapshot=ok(await admin('/api/export'));assert.equal(snapshot.formatVersion,2);assert.equal(snapshot.shop_orders.length,2);assert.equal(snapshot.shop_products.length,2);assert(snapshot.product_events.length>=3);
  assert(!JSON.stringify(snapshot).includes(password));assert(!JSON.stringify(snapshot).includes(process.env.BETTER_AUTH_SECRET));
  for(const sql of ['DELETE FROM shop_orders','DELETE FROM shop_products','TRUNCATE product_events','UPDATE product_events SET kind=\'tampered\''])await assert.rejects(()=>db.query(sql));
 });
 await t.test('deactivated moderator sessions are rejected by new endpoints too',async()=>{
  ok(await admin('/api/team','PATCH',{id:moderator.id,status:'disabled'}));assert.equal((await mod('/api/notifications')).status,401);assert.equal((await mod('/api/dashboard')).status,401);
 });
});
