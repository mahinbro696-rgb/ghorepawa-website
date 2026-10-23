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

test('Client order fixes: admin decisions, assignment and explicit shared moderator listing',async t=>{
 t.after(()=>db.close());const admin=client(),a=client(),b=client(),anon=client();
 ok(await admin('/api/setup'));ok(await admin('/api/login','POST',{username:'admin',password}));
 for(const username of ['client-alice','client-bob'])ok(await admin('/api/team','POST',{username,name:username,password}),201);
 const people=ok(await admin('/api/team')).members.filter(x=>x.role==='moderator');
 const alice=people.find(x=>x.username==='client-alice'),bob=people.find(x=>x.username==='client-bob');
 for(const m of people)ok(await admin('/api/team','PATCH',{id:m.id,status:'active'}));
 ok(await a('/api/login','POST',{username:alice.username,password}));ok(await b('/api/login','POST',{username:bob.username,password}));
 let serial=0;
 async function place(status='new',assigned=null){
  serial++;return (await db.query(`INSERT INTO shop_orders(request_key,fingerprint,customer_name,phone,district,area,address,quantity,unit_price,total,status,assigned_to,product_name,latest_note)
   VALUES($1,'test',$2,$3,'Dhaka','Test area','Test-only sample address',1,399,399,$4,$5,'Sample product','Internal call note') RETURNING *`,[randomUUID(),'Client sample '+serial,'01710000'+String(serial).padStart(3,'0'),status,assigned])).rows[0];
 }
 const read=async id=>ok(await admin('/api/orders?id='+id)).orders[0];
 const change=async (c,o,status,note='')=>c('/api/orders','PATCH',{action:'status',id:o.id,version:o.version,status,note});
 const bulk=(xs,assignee)=>({action:'assign',ids:xs.map(x=>x.id),versions:Object.fromEntries(xs.map(x=>[x.id,x.version])),assignee});
 let confirmed,completed,cancelled,own,other;
 await t.test('Admin can confirm a new unassigned order; it appears in the confirmed queue',async()=>{
  confirmed=await place();const first=await read(confirmed.id);assert(first.allowed_statuses.includes('confirmed'));assert(first.allowed_statuses.includes('cancelled'));assert(first.can_assign);
  ok(await change(admin,first,'confirmed'));confirmed=await read(confirmed.id);
  assert.equal(confirmed.status,'confirmed');assert.equal(confirmed.confirmed_by,null);
  assert(ok(await admin('/api/orders?section=confirmed')).orders.some(x=>x.id===confirmed.id));
 });
 await t.test('Complete is distinct from Confirm and does not require a courier hop',async()=>{
  ok(await change(admin,confirmed,'delivered'));completed=await read(confirmed.id);assert.equal(completed.status,'delivered');assert.deepEqual(completed.allowed_statuses,[]);
  assert(!ok(await admin('/api/orders?section=confirmed')).orders.some(x=>x.id===completed.id));
  assert(ok(await admin('/api/orders?section=completed')).orders.some(x=>x.id===completed.id));
  assert(!ok(await admin('/api/orders?section=cancelled')).orders.some(x=>x.id===completed.id));
  assert.equal((await change(admin,completed,'cancelled','Wrong terminal change')).status,409);
 });
 await t.test('Cancel requires a reason and persists in its own queue and All orders',async()=>{
  cancelled=await place();const rejected=await change(admin,cancelled,'cancelled');assert.equal(rejected.status,400);assert.match(rejected.body.error,/reason/);
  assert.equal((await read(cancelled.id)).status,'new');ok(await change(admin,cancelled,'cancelled','Customer declined'));
  cancelled=await read(cancelled.id);assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.latest_note,'Customer declined');
  assert(ok(await admin('/api/orders?section=cancelled')).orders.some(x=>x.id===cancelled.id));
  assert(!ok(await admin('/api/orders?section=completed')).orders.some(x=>x.id===cancelled.id));
  const all=ok(await admin('/api/orders'));assert(all.orders.some(x=>x.id===cancelled.id));assert.equal(all.stats.cancelled,1);assert.equal(all.stats.delivered,1);
 });
 await t.test('All orders bulk distribution changes only selected eligible records',async()=>{
  own=await place();other=await place();const untouched=await place();
  const result=ok(await admin('/api/orders','PATCH',bulk([own,other],alice.id)));assert.equal(result.count,2);
  own=await read(own.id);other=await read(other.id);assert.equal(own.status,'assigned');assert.equal(other.assigned_to,alice.id);assert.equal((await read(untouched.id)).status,'new');
  assert.equal(ok(await a('/api/orders')).total,2);
  assert.equal((await admin('/api/orders','PATCH',bulk([own,completed],bob.id))).status,409);
  assert.equal((await read(own.id)).assigned_to,alice.id);
  ok(await admin('/api/orders','PATCH',bulk([other],bob.id)));other=await read(other.id);assert.equal(other.assigned_to,bob.id);
 });
 await t.test('Shared moderator list exposes all statuses but no money, internal keys or other call notes',async()=>{
  const list=ok(await a('/api/orders?scope=all'));assert.equal(list.total,ok(await admin('/api/orders')).total);assert.equal(list.scope,'all');
  assert(list.orders.some(x=>x.id===completed.id));assert(list.orders.some(x=>x.id===other.id));
  for(const o of list.orders){assert.equal(o.read_only,true);assert.equal(o.can_update,false);assert.equal(o.latest_note,null);for(const k of ['unit_price','total','fingerprint','request_key','assigned_to','confirmed_by','assigned_name'])assert(!(k in o));}
  assert.equal(ok(await a('/api/orders?id='+other.id)).total,0);
  assert.equal(ok(await a('/api/orders?scope=all&id='+other.id)).orders[0].id,other.id);
  assert.equal(ok(await a('/api/orders')).total,1);assert.equal(ok(await a('/api/orders')).orders[0].can_update,true);
 });
 await t.test('Reading all orders does not grant editing, assignment, deletion or admin permissions',async()=>{
  const fresh=await read(other.id);
  for(const status of ['confirmed','cancelled','delivered'])assert.equal((await change(a,fresh,status,'Forbidden cross-staff change')).status,403);
  assert.equal((await a('/api/orders','PATCH',{action:'note',id:fresh.id,version:fresh.version,note:'No access'})).status,403);
  assert.equal((await a('/api/orders','PATCH',bulk([fresh],alice.id))).status,403);
  assert.equal((await a('/api/orders','DELETE',{id:fresh.id,version:fresh.version,reference:String(fresh.reference),confirmPermanentDelete:true})).status,403);
  assert.equal((await a('/api/team')).status,403);assert.equal((await a('/api/export')).status,403);assert.equal((await anon('/api/orders?scope=all')).status,401);
  assert.equal((await read(fresh.id)).assigned_to,bob.id);
 });
 await t.test('Default work handoff remains private; shared list retains submitted records read-only',async()=>{
  own=await read(own.id);ok(await change(a,own,'confirmed'));assert.equal(ok(await a('/api/orders')).total,0);
  const shared=ok(await a('/api/orders?scope=all&id='+own.id)).orders[0];assert.equal(shared.status,'confirmed');assert.equal(shared.can_update,false);
  assert.equal(ok(await a('/api/workhistory')).items[0].outcome,'confirmed');
  assert.equal((await change(a,await read(own.id),'delivered')).status,403);
  ok(await change(admin,await read(own.id),'cancelled','Admin final decision'));
  assert(ok(await admin('/api/orders?section=cancelled')).orders.some(x=>x.id===own.id));
 });
 await t.test('Shared-list permission checks preserve other staff rows, and deletion removes them',async()=>{
  const tracked=other.id;assert.deepEqual(ok(await a('/api/notifications?tracked='+tracked)).accessibleIds,[]);
  assert.deepEqual(ok(await a('/api/notifications?scope=all&tracked='+tracked)).accessibleIds,[tracked]);
  const o=await read(tracked);ok(await admin('/api/orders','DELETE',{id:o.id,reference:String(o.reference),version:o.version,confirmPermanentDelete:true}));
  assert.deepEqual(ok(await a('/api/notifications?scope=all&tracked='+tracked)).accessibleIds,[]);assert.equal(ok(await a('/api/orders?scope=all&id='+tracked)).orders.length,0);
 });
 await t.test('Stale decisions and stale/inactive assignment fail without partial updates',async()=>{
  const x=await place(),y=await place();ok(await change(admin,x,'confirmed'));
  assert.equal((await change(admin,x,'cancelled','stale')).status,409);assert.equal((await read(x.id)).status,'confirmed');
  const current=await read(y.id);ok(await admin('/api/team','PATCH',{id:bob.id,status:'disabled'}));
  assert.equal((await admin('/api/orders','PATCH',bulk([current],bob.id))).status,400);assert.equal((await read(y.id)).status,'new');
  assert.equal((await b('/api/orders?scope=all')).status,401); // disabled sessions are revoked
 });
 await t.test('Shared list search and pagination cover the database, not only the first page',async()=>{
  for(let i=0;i<32;i++)await place();const p1=ok(await a('/api/orders?scope=all')),p2=ok(await a('/api/orders?scope=all&page=2'));
  assert.equal(p1.orders.length,30);assert(p2.orders.length>0);assert.equal(p1.total,p2.total);
  assert.equal(ok(await a('/api/orders?scope=all&status=cancelled')).orders.every(x=>x.status==='cancelled'),true);
  assert(ok(await a('/api/orders?scope=all&q=Dhaka')).total>=32);
  assert.equal((await a('/api/orders?scope=invalid')).status,400);
 });
 await t.test('Panel UI literals and staff API messages are English; customer Unicode is not altered',async()=>{
  const {readFile}=await import('node:fs/promises');
  for(const p of ['public/admin/admin.js','public/admin/work.js','public/admin/portal.js','public/admin/index.html','api/login.js','api/team.js','api/security.js','api/session.js']){
   assert(!/[\u0980-\u09ff]/.test(await readFile(new URL('../'+p,import.meta.url),'utf8')),p+' has untranslated UI literals');
  }
  const invalid=await anon('/api/login','POST',{username:'bad-user',password:'wrong'});assert.match(invalid.body.error,/username|password/i);
 });
});
