import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {randomBytes,randomUUID} from 'node:crypto';
import {hashPassword} from 'better-auth/crypto';
import {base32} from '@better-auth/utils/base32';
import {createOTP} from '@better-auth/utils/otp';
const db=new PGlite();
const pool={query:(sql,args)=>db.query(sql,args),connect:async()=>({query:(sql,args)=>db.query(sql,args),release(){}}),end:async()=>{}};
mock.module('../server/db.mjs',{namedExports:{getPool:()=>pool,transaction:async fn=>{await db.query('BEGIN');try{const result=await fn(pool);await db.query('COMMIT');return result;}catch(e){await db.query('ROLLBACK');throw e;}}}});
process.env.NODE_ENV='test';process.env.APP_ORIGIN='http://localhost:3000';process.env.BETTER_AUTH_SECRET=randomBytes(40).toString('hex');
const password=randomBytes(20).toString('base64url');process.env.ADMIN_INITIAL_PASSWORD_HASH=await hashPassword(password);
function client(){const cookies=new Map();return async(path,method='GET',data,extra={})=>{
 const url=new URL(path,'http://localhost:3000');const {default:handler}=await import('../api/'+url.pathname.slice(5)+'.js');
 let status=200,output='',head={};const req={method,url:path,body:data,headers:{host:'localhost:3000',origin:'http://localhost:3000','content-type':'application/json',cookie:[...cookies].map(([k,v])=>k+'='+v).join('; '),...extra},socket:{remoteAddress:'127.0.0.1'}};
 const res={setHeader(k,v){head[k.toLowerCase()]=v;},status(n){status=n;return this;},json(value){output=JSON.stringify(value);},end(value=''){output+=value;},write(value){output+=value;},destroy(){throw Error('stream failed');}};
 await handler(req,res);
 for(const cookie of head['set-cookie']||[]){const pair=cookie.split(';')[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1));}
 return {status,body:output?JSON.parse(output):null};
};}
const ok=(r,n=200)=>{assert.equal(r.status,n,JSON.stringify(r.body));return r.body;};
test('complete persisted order/team/2FA workflow against embedded PostgreSQL',async(t)=>{
 t.after(()=>db.close());
 const admin=client(),mod=client(),other=client(),anon=client();
 ok(await admin('/api/setup'));ok(await admin('/api/login','POST',{username:'admin',password}));
 assert.equal(ok(await admin('/api/session')).user.role,'admin');
 for(const username of ['moderator1','moderator2'])ok(await admin('/api/team','POST',{username,name:username,password}),201);
 assert.equal((await mod('/api/login','POST',{username:'moderator1',password})).status,403);
 const members=ok(await admin('/api/team')).members.filter(m=>m.role==='moderator');
 for(const m of members)ok(await admin('/api/team','PATCH',{id:m.id,status:'active'}));
 ok(await mod('/api/login','POST',{username:'moderator1',password}));ok(await other('/api/login','POST',{username:'moderator2',password}));
 assert.equal((await mod('/api/team')).status,403);assert.equal((await anon('/api/orders')).status,401);
 const payload={name:'Test customer',phone:'01700000001',district:'Dhaka',area:'Dhanmondi',address:'Test address only',quantity:2,total:1};const key=randomUUID();
 const order=ok(await anon('/api/orders','POST',payload,{'idempotency-key':key}),201);
 assert.equal(order.total,798);assert.equal(ok(await anon('/api/orders','POST',payload,{'idempotency-key':key})).reference,order.reference);
 assert.equal((await anon('/api/orders','POST',{...payload,quantity:3},{'idempotency-key':key})).status,409);
 let item=ok(await admin('/api/orders')).orders[0];const moderator=members.find(m=>m.username==='moderator1');
 ok(await admin('/api/orders','PATCH',{action:'assign',ids:[item.id],assignee:moderator.id}));
 assert.equal(ok(await other('/api/orders')).total,0);assert.equal((await other('/api/history?id='+item.id)).status,403);
 item=ok(await mod('/api/orders')).orders[0];assert.equal((await mod('/api/orders','PATCH',{action:'status',id:item.id,version:item.version,status:'approved',note:''})).status,409);
 ok(await mod('/api/orders','PATCH',{action:'status',id:item.id,version:item.version,status:'callback',note:'Call later',callbackAt:new Date(Date.now()+3600000).toISOString()}));
 assert.equal((await mod('/api/orders','PATCH',{action:'note',id:item.id,version:item.version,note:'Stale note'})).status,409);
 item=ok(await mod('/api/orders')).orders[0];ok(await mod('/api/orders','PATCH',{action:'status',id:item.id,version:item.version,status:'confirmed',note:'Confirmed'}));
 for(const status of ['approved','dispatched','delivered']){item=ok(await admin('/api/orders')).orders[0];ok(await admin('/api/orders','PATCH',{action:'status',id:item.id,version:item.version,status,note:'Reviewed'}));}
 assert(ok(await admin('/api/history?id='+item.id)).events.length>=7);
 for(const sql of ['DELETE FROM shop_orders','TRUNCATE shop_orders CASCADE','DELETE FROM order_events',"UPDATE order_events SET note='tampered'", "UPDATE shop_orders SET address='tampered'"]){await assert.rejects(()=>db.query(sql));}
 const backup=ok(await admin('/api/export'));assert.equal(backup.shop_orders.length,1);assert(backup.order_events.length>=7);assert(!JSON.stringify(backup).includes(password));assert.equal((await mod('/api/export')).status,403);
 ok(await admin('/api/team','PATCH',{id:moderator.id,status:'disabled'}));assert.equal((await mod('/api/orders')).status,401);
 ok(await admin('/api/team','PATCH',{action:'password',id:moderator.id,password:password+'x'}));ok(await admin('/api/team','PATCH',{id:moderator.id,status:'active'}));ok(await mod('/api/login','POST',{username:'moderator1',password:password+'x'}));
 const olderSession=client();ok(await olderSession('/api/login','POST',{username:'admin',password}));
 const enrollment=ok(await admin('/api/security','POST',{action:'enable',password}));assert(enrollment.qr.startsWith('data:image/png'));assert.equal(enrollment.backupCodes.length,10);
 const code=await createOTP(new TextDecoder().decode(base32.decode(enrollment.secret)),{digits:6,period:30}).totp();
 ok(await admin('/api/security','POST',{action:'verify',code}));assert.equal(ok(await admin('/api/security')).enabled,true);assert.equal((await olderSession('/api/orders')).status,401);
 ok(await admin('/api/session','POST',{action:'logout'}));
 assert.equal(ok(await admin('/api/login','POST',{username:'admin',password})).twoFactorRedirect,true);
 assert.equal((await admin('/api/orders')).status,401);
 assert.equal((await admin('/api/security','POST',{action:'verify',code:'000000'})).status,400);
 ok(await admin('/api/security','POST',{action:'verify',code:await createOTP(new TextDecoder().decode(base32.decode(enrollment.secret)),{digits:6,period:30}).totp()}));
 assert.equal(ok(await admin('/api/session')).user.role,'admin');
 ok(await admin('/api/session','POST',{action:'logout'}));ok(await admin('/api/login','POST',{username:'admin',password}));
 ok(await admin('/api/security','POST',{action:'recover',code:enrollment.backupCodes[0]}));
 ok(await admin('/api/security','POST',{action:'disable',password,code:await createOTP(new TextDecoder().decode(base32.decode(enrollment.secret)),{digits:6,period:30}).totp()}));assert.equal(ok(await admin('/api/security')).enabled,false);
});
