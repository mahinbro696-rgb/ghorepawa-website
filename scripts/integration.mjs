import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
const base=process.env.TEST_ORIGIN,token=process.env.TEST_PASSWORD,bypass=process.env.TEST_BYPASS;
if(!base||!token)throw Error('Test origin and owner password are required');
const pass=randomBytes(20).toString('base64url'),prefix='test'+Date.now().toString(36);
function client(){let cookies=new Map();return async(path,method='GET',data,extra={})=>{
 const url=new URL(path,base);if(bypass)url.searchParams.set('x-vercel-protection-bypass',bypass);
 const response=await fetch(url,{method,headers:{...(method!=='GET'?{'Content-Type':'application/json',Origin:base}:{}),Cookie:[...cookies].map(([k,v])=>k+'='+v).join('; '),...extra},body:data===undefined?undefined:JSON.stringify(data),signal:AbortSignal.timeout(60000)});
 for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1));}
 const raw=await response.text();let body;try{body=JSON.parse(raw);}catch{throw Error(`Non-JSON response at ${path}: HTTP ${response.status} ${raw.slice(0,80)}`);}return {status:response.status,body};
};}
const owner=client(),mod=client(),other=client(),publicClient=client();
function ok(result,status=200){assert.equal(result.status,status,JSON.stringify(result.body));return result.body;}
console.log('Testing preview database initialization…');
assert.equal(ok(await owner('/api/setup')).configured,true);
assert.equal((await owner('/api/setup','POST',{})).status,405);
ok(await owner('/api/login','POST',{username:process.env.TEST_USERNAME||'admin',password:token}));assert.equal(ok(await owner('/api/session')).user.role,'admin');
console.log('PASS: direct owner login and public setup disabled');
for(const suffix of ['a','b'])ok(await owner('/api/team','POST',{name:'পরীক্ষামূলক মডারেটর '+suffix,username:prefix+suffix,password:pass}),201);
assert.equal((await mod('/api/login','POST',{username:prefix+'a',password:pass})).status,403);
const people=ok(await owner('/api/team')).members.filter(x=>x.role==='moderator');assert.equal(people.length,2);
for(const person of people)ok(await owner('/api/team','PATCH',{id:person.id,status:'active'}));
ok(await mod('/api/login','POST',{username:prefix+'a',password:pass}));ok(await other('/api/login','POST',{username:prefix+'b',password:pass}));
assert.equal((await mod('/api/team')).status,403);assert.equal((await publicClient('/api/orders')).status,401);
console.log('PASS: pending login blocked, approval works, admin and anonymous restrictions');
const data={name:'পরীক্ষামূলক কাস্টমার',phone:'01700000001',district:'ঢাকা',area:'ধানমন্ডি',address:'শুধু পরীক্ষামূলক ঠিকানা',quantity:2,unitPrice:1,total:1};
const key=randomUUID();const first=ok(await publicClient('/api/orders','POST',data,{'Idempotency-Key':key}),201);assert.equal(first.total,798);
assert.equal(ok(await publicClient('/api/orders','POST',data,{'Idempotency-Key':key})).reference,first.reference);
assert.equal((await publicClient('/api/orders','POST',{...data,quantity:11},{'Idempotency-Key':randomUUID()})).status,400);
assert.equal((await publicClient('/api/orders','POST',data,{'Idempotency-Key':randomUUID(),Origin:'https://untrusted.example'})).status,403);
assert.equal((await publicClient('/api/orders','POST',{...data,quantity:3},{'Idempotency-Key':key})).status,409);
console.log('PASS: persisted order, server pricing, duplicate retries, validation and origin guard');
let list=ok(await owner('/api/orders'));assert.equal(list.total,1);let order=list.orders[0];
const a=people.find(x=>x.username===prefix+'a');
ok(await owner('/api/orders','PATCH',{action:'assign',ids:[order.id],assignee:a.id}));
assert.equal(ok(await other('/api/orders')).total,0);assert.equal((await other('/api/history?id='+order.id)).status,403);
order=ok(await mod('/api/orders')).orders[0];
assert.equal((await mod('/api/orders','PATCH',{action:'status',id:order.id,version:order.version,status:'approved',note:''})).status,409);
assert.equal((await mod('/api/orders','PATCH',{action:'status',id:order.id,version:order.version,status:'callback',note:'',callbackAt:new Date(Date.now()+3600000).toISOString()})).status,400);
ok(await mod('/api/orders','PATCH',{action:'status',id:order.id,version:order.version,status:'callback',note:'পরীক্ষামূলক কলব্যাক',callbackAt:new Date(Date.now()+3600000).toISOString()}));
assert.equal((await mod('/api/orders','PATCH',{action:'note',id:order.id,version:order.version,note:'stale edit'})).status,409);
order=ok(await mod('/api/orders')).orders[0];ok(await mod('/api/orders','PATCH',{action:'status',id:order.id,version:order.version,status:'confirmed',note:'ফোনে নিশ্চিত'}));
order=ok(await owner('/api/orders?status=confirmed')).orders[0];ok(await owner('/api/orders','PATCH',{action:'status',id:order.id,version:order.version,status:'approved',note:'যাচাই সম্পন্ন'}));
assert.equal((await owner('/api/orders','PATCH',{action:'assign',ids:[order.id],assignee:a.id})).status,409);
console.log('PASS: bulk assignment, moderator isolation, callback, stale-edit protection and final admin approval');
for(const state of ['dispatched','delivered']){order=ok(await owner('/api/orders')).orders[0];ok(await owner('/api/orders','PATCH',{action:'status',id:order.id,version:order.version,status:state,note:'পরীক্ষামূলক আপডেট'}));}
assert(ok(await owner('/api/history?id='+order.id)).events.length>=7);
ok(await owner('/api/team','PATCH',{id:a.id,status:'disabled'}));assert.equal((await mod('/api/orders')).status,401);
const pass2=randomBytes(20).toString('base64url');ok(await owner('/api/team','PATCH',{action:'password',id:a.id,password:pass2}));ok(await owner('/api/team','PATCH',{id:a.id,status:'active'}));assert.equal((await mod('/api/login','POST',{username:prefix+'a',password:pass})).status,401);ok(await mod('/api/login','POST',{username:prefix+'a',password:pass2}));
console.log('PASS: shipping status, audit history, disabled account session revocation and password reset');
console.log('ALL PREVIEW INTEGRATION CHECKS PASSED. Test data remains only in the preview database.');
