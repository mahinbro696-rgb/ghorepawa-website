import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {randomBytes,randomUUID} from 'node:crypto';
import {hashPassword} from 'better-auth/crypto';
import {searchTerms,appendOrderSearch} from '../server/order-search.mjs';

test('search normalizes reference/phone/Bengali digits without SQL interpolation',()=>{
 assert.deepEqual(searchTerms(' es - \u09e6\u09e6\u09eb '),['ES-5']);
 assert.deepEqual(searchTerms('+88 (01700) 000-123'),['01700000123']);
 assert.deepEqual(searchTerms('\u09e6\u09e7\u09ed\u09e6\u09e6\u09e6\u09e6\u09e6\u09e7\u09e8\u09e9'),['01700000123']);
 assert.deepEqual(searchTerms('  Nusrat   Dhaka  '),['Nusrat','Dhaka']);
 assert.deepEqual(searchTerms(''),[]);
 const params=['existing'],where=[];
 appendOrderSearch("50%_!\\'",params,where);
 assert.equal(params[1],"%50!%!_!!\\'%");assert(!where[0].includes('50%'));assert(where[0].includes('$2'));
});
const db=new PGlite();
const pool={query:(sql,args)=>db.query(sql,args),connect:async()=>({query:(sql,args)=>db.query(sql,args),release(){}}),end:async()=>{}};
mock.module('../server/db.mjs',{namedExports:{getPool:()=>pool,transaction:async fn=>{await db.query('BEGIN');try{const r=await fn(pool);await db.query('COMMIT');return r;}catch(e){await db.query('ROLLBACK');throw e;}}}});
process.env.NODE_ENV='test';process.env.APP_ORIGIN='http://localhost:3000';process.env.BETTER_AUTH_SECRET=randomBytes(40).toString('hex');
const password=randomBytes(20).toString('base64url');process.env.ADMIN_INITIAL_PASSWORD_HASH=await hashPassword(password);
function client(){const cookies=new Map();return async(path,method='GET',data)=>{
 const {default:handler}=await import('../api/'+new URL(path,'http://localhost').pathname.slice(5)+'.js');let status=200,out='',head={};
 const req={method,url:path,body:data,headers:{host:'localhost:3000',origin:'http://localhost:3000','content-type':'application/json',cookie:[...cookies].map(([k,v])=>k+'='+v).join('; ')},socket:{remoteAddress:'127.0.0.1'}};
 const res={setHeader(k,v){head[k.toLowerCase()]=v;},status(n){status=n;return this;},json(x){out=JSON.stringify(x);},end(x=''){out+=x;},write(x){out+=x;},destroy(){throw Error('stream failed');}};
 await handler(req,res);for(const c of head['set-cookie']||[]){const pair=c.split(';')[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1));}
 return {status,body:out?JSON.parse(out):null};
};}
const ok=(r,status=200)=>{assert.equal(r.status,status,JSON.stringify(r.body));return r.body;};
test('actual orders API: all partial matches, pagination, special characters and scoped permissions',async t=>{
 t.after(()=>db.close());const admin=client(),a=client(),b=client(),anon=client();
 ok(await admin('/api/setup'));ok(await admin('/api/login','POST',{username:'admin',password}));
 for(const username of ['search-one','search-two'])ok(await admin('/api/team','POST',{username,name:username,password}),201);
 const members=ok(await admin('/api/team')).members.filter(m=>m.role==='moderator');
 for(const m of members)ok(await admin('/api/team','PATCH',{id:m.id,status:'active'}));
 ok(await a('/api/login','POST',{username:'search-one',password}));ok(await b('/api/login','POST',{username:'search-two',password}));
 const first=members.find(m=>m.username==='search-one'),second=members.find(m=>m.username==='search-two');let i=0;
 async function insert(name,address='Shared Lane',extra={}){
  i++;return (await db.query(`INSERT INTO shop_orders(request_key,fingerprint,customer_name,phone,district,area,address,quantity,unit_price,total,status,assigned_to,product_name)
   VALUES($1,$2,$3,$4,$5,$6,$7,1,399,399,$8,$9,'Ever Strong') RETURNING *`,[randomUUID(),'test-'+i,name,extra.phone||'01700000'+String(i).padStart(3,'0'),extra.district||'Dhaka',extra.area||'Dhanmondi',address,extra.status||'new',extra.assigned||null])).rows[0];
 }
 const local=await insert('Nusrat Jahan','House 12, Shared Lane',{phone:'01700000123',assigned:first.id,status:'assigned'});
 await insert('NUSRAT Rahman','House 25, Shared Lane',{assigned:second.id,status:'assigned'});
 const bn=await insert('\u09a8\u09c1\u09b8\u09b0\u09be\u09a4 \u0986\u0995\u09cd\u09a4\u09be\u09b0','\u09ac\u09be\u09b8\u09be \u09e7\u09e8, \u09b8\u09c7\u09a8\u09aa\u09be\u09dc\u09be',{district:'Rangpur',area:'Sadar'});
 await insert('Literal% Buyer','Apartment_One! \\ backslash');
 await insert('Callback Buyer','Return Road',{status:'callback'});
 for(let n=0;n<38;n++)await insert('Pagination Buyer '+n);
 const search=async(q,extra='',who=admin)=>ok(await who('/api/orders?'+new URLSearchParams({q})+extra));
 await t.test('partial name and address searches span the whole dataset, not only loaded rows',async()=>{
  assert.equal((await search('nusrat')).total,2);assert.equal((await search('SHARED')).total,40);
  assert.equal((await search('Jahan Dhaka')).total,1);assert.equal((await search('Dhan')).total,42);
  assert.equal((await search('rangpur')).orders[0].id,bn.id);
  assert.equal((await search('\u09b8\u09c7\u09a8\u09aa\u09be\u09dc\u09be')).orders[0].id,bn.id);
  assert.equal((await search('Sadar 12')).orders[0].id,bn.id);
 });
 await t.test('reference variants and formatted/Bengali phone numbers work',async()=>{
  const q='es - '+local.reference;assert((await search(q)).orders.some(o=>o.id===local.id));
  assert.equal((await search('+88 (01700) 000-123')).total,1);
  assert.equal((await search('\u09e6\u09e7\u09ed\u09e6\u09e6\u09e6\u09e6\u09e6\u09e7\u09e8\u09e9')).orders[0].id,local.id);
  assert.equal((await search('\u09a8\u09c1\u09b8\u09b0\u09be\u09a4')).orders[0].id,bn.id);
 });
 await t.test('every match is reachable across pages without duplicates; status/section filters apply',async()=>{
  const p1=await search('shared','&page=1'),p2=await search('shared','&page=2');
  assert.equal(p1.total,40);assert.equal(p1.orders.length,30);assert.equal(p2.orders.length,10);
  assert.equal(new Set([...p1.orders,...p2.orders].map(o=>o.id)).size,40);
  assert.equal((await search('shared','&status=assigned')).total,2);
  assert.equal((await search('Return','&section=callbacks')).total,1);
  assert.equal((await search('shared','&section=callbacks')).total,0);
 });
 await t.test('SQL wildcard characters are literal, empty/no-match queries and hostile input are safe',async()=>{
  for(const q of ['%','_','!','\\'])assert.equal((await search(q)).total,1,q);
  assert.equal((await search("%' OR 1=1 --")).total,0);assert.equal((await search('no-such-customer')).total,0);
  assert.equal((await search('   ')).total,43);
  assert.equal((await admin('/api/orders?page=1.5')).status,400);
 });
 await t.test('moderator cannot find another moderator/customer or money via broad search',async()=>{
  const data=await search('Shared','&assignee='+second.id,a);assert.equal(data.total,1);assert.equal(data.orders[0].id,local.id);
  for(const key of ['total','unit_price','assigned_name','fingerprint'])assert(!(key in data.orders[0]));
  assert.equal((await search('NUSRAT Rahman','',a)).total,0);
  assert.equal((await anon('/api/orders?q=shared')).status,401);
 });
});
