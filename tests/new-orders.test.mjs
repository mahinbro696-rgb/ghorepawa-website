import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {randomBytes,randomUUID} from 'node:crypto';
import {hashPassword} from 'better-auth/crypto';
// Exercise the existing server filters/atomic assignment; never connect to customer data.
const db=new PGlite();
const pool={query:(sql,args)=>db.query(sql,args),connect:async()=>({query:(sql,args)=>db.query(sql,args),release(){}}),end:async()=>{}};
mock.module('../server/db.mjs',{namedExports:{getPool:()=>pool,transaction:async fn=>{await db.query('BEGIN');try{const r=await fn(pool);await db.query('COMMIT');return r;}catch(e){await db.query('ROLLBACK');throw e;}}}});
process.env.NODE_ENV='test';process.env.APP_ORIGIN='http://localhost:3000';process.env.BETTER_AUTH_SECRET=randomBytes(40).toString('hex');
delete process.env.DATABASE_URL;
const password=randomBytes(20).toString('base64url');process.env.ADMIN_INITIAL_PASSWORD_HASH=await hashPassword(password);
function client(){const cookies=new Map();return async(path,method='GET',data)=>{
 const {default:handler}=await import('../api/'+new URL(path,'http://localhost').pathname.slice(5)+'.js');let status=200,out='',head={};
 const req={method,url:path,body:data,headers:{host:'localhost:3000',origin:'http://localhost:3000','content-type':'application/json',cookie:[...cookies].map(([k,v])=>k+'='+v).join('; ')},socket:{remoteAddress:'127.0.0.1'}};
 const res={setHeader(k,v){head[k.toLowerCase()]=v;},status(n){status=n;return this;},json(x){out=JSON.stringify(x);},end(x=''){out+=x;},write(x){out+=x;},destroy(){throw Error('stream failed');}};
 await handler(req,res);for(const c of head['set-cookie']||[]){const pair=c.split(';')[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1));}
 return {status,body:out?JSON.parse(out):null};
};}
const ok=(r,status=200)=>{assert.equal(r.status,status,JSON.stringify(r.body));return r.body;};
const queue='/api/orders?status=new&assignee=unassigned';
test('New orders queue: filtered view, atomic bulk handoff and All orders retention',async t=>{
 t.after(()=>db.close());const admin=client(),a=client(),b=client(),anon=client();
 ok(await admin('/api/setup'));ok(await admin('/api/login','POST',{username:'admin',password}));
 for(const username of ['newqueue-a','newqueue-b'])ok(await admin('/api/team','POST',{username,name:username,password}),201);
 const members=ok(await admin('/api/team')).members.filter(m=>m.role==='moderator');
 for(const m of members)ok(await admin('/api/team','PATCH',{id:m.id,status:'active'}));
 const first=members.find(m=>m.username==='newqueue-a'),second=members.find(m=>m.username==='newqueue-b');
 ok(await a('/api/login','POST',{username:first.username,password}));ok(await b('/api/login','POST',{username:second.username,password}));
 let serial=0;
 async function insert(name,status='new',assigned=null){
  serial++;return (await db.query(`INSERT INTO shop_orders(request_key,fingerprint,customer_name,phone,district,area,address,quantity,unit_price,total,status,assigned_to,product_name)
   VALUES($1,$2,$3,$4,'Dhaka','Queue area','Sample test address',1,399,399,$5,$6,'Ever Strong') RETURNING *`,[randomUUID(),'test-'+serial,name,'01700000'+String(serial).padStart(3,'0'),status,assigned])).rows[0];
 }
 const n1=await insert('New One'),n2=await insert('New Two'),n3=await insert('New Three');
 await insert('Existing assigned','assigned',second.id);await insert('Callback with admin','callback');await insert('Cancelled order','cancelled');
 const bulk=(orders,to)=>({action:'assign',ids:orders.map(o=>o.id),assignee:to,versions:Object.fromEntries(orders.map(o=>[o.id,o.version]))});
 const row=async id=>ok(await admin('/api/orders?id='+id)).orders[0];
 await t.test('only new unassigned orders enter the queue; All orders keeps every status',async()=>{
  const data=ok(await admin(queue));assert.equal(data.total,3);assert.deepEqual(new Set(data.orders.map(o=>o.id)),new Set([n1.id,n2.id,n3.id]));
  assert.equal(ok(await admin('/api/orders')).total,6);assert.equal(ok(await admin(queue+'&q=Two')).total,1);
  assert.equal(ok(await admin(queue+'&q=Callback')).total,0);
 });
 await t.test('bulk assignment removes only selected orders from New orders without deletion',async()=>{
  ok(await admin('/api/orders','PATCH',bulk([n1,n2],first.id)));
  const left=ok(await admin(queue));assert.equal(left.total,1);assert.equal(left.orders[0].id,n3.id);
  assert.equal(ok(await admin('/api/orders')).total,6);
  for(const n of [n1,n2]){const r=await row(n.id);assert.equal(r.assigned_to,first.id);assert.equal(r.status,'assigned');assert.equal(r.customer_name,n.customer_name);}
 });
 await t.test('inactive target or stale mixed batch fails without moving the remaining new order',async()=>{
  const third=await row(n3.id);
  assert.equal((await admin('/api/orders','PATCH',bulk([n1,third],second.id))).status,409);
  assert.equal((await row(third.id)).status,'new');assert.equal((await row(n1.id)).assigned_to,first.id);
  ok(await admin('/api/team','PATCH',{id:second.id,status:'disabled'}));
  assert.equal((await admin('/api/orders','PATCH',bulk([third],second.id))).status,400);
  assert.equal(ok(await admin(queue)).total,1);
  ok(await admin('/api/team','PATCH',{id:second.id,status:'active'}));
  // Disabling a moderator revokes its session even after reactivation.
  ok(await b('/api/login','POST',{username:second.username,password}));
 });
 await t.test('moderator sees only its assigned tasks and cannot access/assign the new queue',async()=>{
  assert.equal(ok(await a(queue)).total,0);assert.equal(ok(await anon('/api/orders'),401).error.length>0,true);
  assert.equal((await a('/api/orders','PATCH',bulk([await row(n3.id)],first.id))).status,403);
  const data=ok(await a('/api/orders'));assert.equal(data.total,2);assert(data.orders.every(o=>[n1.id,n2.id].includes(o.id)));
  assert.equal(ok(await b('/api/orders')).total,1);
 });
 await t.test('assigning all remaining empties the queue; a later incoming order appears',async()=>{
  ok(await admin('/api/orders','PATCH',bulk([await row(n3.id)],first.id)));
  assert.equal(ok(await admin(queue)).total,0);assert.equal(ok(await admin('/api/orders')).total,6);
  const later=await insert('Later incoming');assert.equal(ok(await admin(queue)).orders[0].id,later.id);
 });
 await t.test('pagination searches the entire queue; moving a later page preserves earlier waiting rows',async()=>{
  for(let n=0;n<30;n++)await insert('Page fixture '+n);
  const p1=ok(await admin(queue+'&page=1')),p2=ok(await admin(queue+'&page=2'));
  assert.equal(p1.total,31);assert.equal(p1.orders.length,30);assert.equal(p2.orders.length,1);
  ok(await admin('/api/orders','PATCH',bulk(p2.orders,second.id)));
  const next=ok(await admin(queue));assert.equal(next.total,30);assert.equal(next.orders.length,30);
  assert.equal(ok(await admin('/api/orders')).total,37);
  assert.equal((await row(p2.orders[0].id)).status,'assigned');
 });
});
