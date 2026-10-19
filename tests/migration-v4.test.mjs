import {test,mock} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {randomBytes,randomUUID} from 'node:crypto';
import {hashPassword} from 'better-auth/crypto';
const db=new PGlite(),pool={query:(q,a)=>db.query(q,a),connect:async()=>({query:(q,a)=>db.query(q,a),release(){}})};
mock.module('../server/db.mjs',{namedExports:{getPool:()=>pool,transaction:async fn=>{await db.query('BEGIN');try{const x=await fn(pool);await db.query('COMMIT');return x;}catch(e){await db.query('ROLLBACK');throw e;}}}});
const realWorkflow=await import('../server/workflow.mjs');
mock.module('../server/workflow.mjs',{namedExports:{...realWorkflow,upgradeWorkflow:async()=>{}}});
process.env.NODE_ENV='test';process.env.APP_ORIGIN='http://localhost:3000';process.env.BETTER_AUTH_SECRET=randomBytes(40).toString('hex');
process.env.ADMIN_INITIAL_PASSWORD_HASH=await hashPassword(randomBytes(20).toString('hex'));
test('v2 data upgrades without deleting orders; legacy active rounds cannot collide with history',async t=>{
 t.after(()=>db.close());const {ensureSchema}=await import('../server/schema.mjs');await ensureSchema();
 assert.equal((await db.query('SELECT max(version) v FROM shop_schema')).rows[0].v,3);
 const mod=randomUUID();
 await db.query(`INSERT INTO team_auth_users(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,'Legacy moderator',$2,false,now(),now())`,[mod,mod+'@example.invalid']);
 await db.query("INSERT INTO team_members(id,username,name,role,status) VALUES($1,'legacy-mod','Legacy moderator','moderator','active')",[mod]);
 const ids=[];
 for(const status of ['confirmed','callback','assigned']){
  const id=randomUUID();ids.push(id);
  await db.query(`INSERT INTO shop_orders(id,request_key,fingerprint,customer_name,phone,district,area,address,quantity,unit_price,total,status,assigned_to,assigned_at)
   VALUES($1,$2,'test','Original customer','01700000001','Dhaka','Area','Original address',1,399,399,$3,$4,now()-interval '2 hours')`,[id,randomUUID(),status,mod]);
  await db.query("INSERT INTO order_events(order_id,actor_id,kind,from_status,to_status) VALUES($1,$2,'status','assigned',$3)",[id,mod,status==='assigned'?'callback':status]);
  if(status==='assigned')await db.query("UPDATE shop_orders SET assigned_at=now()+interval '1 second' WHERE id=$1",[id]);
 }
 await realWorkflow.upgradeWorkflow();await realWorkflow.upgradeWorkflow();
 const rows=(await db.query('SELECT * FROM shop_orders ORDER BY reference')).rows;
 assert.equal(rows.length,3);assert(rows.every(o=>o.customer_name==='Original customer'&&o.total===399));
 assert.equal(rows[0].assigned_to,null);assert.equal(rows[0].confirmed_by,mod);assert.equal(rows[1].assigned_to,null);assert.equal(rows[1].callback_customer,true);
 assert.equal(rows[2].assigned_to,mod);assert.equal(rows[2].assignment_round,1);
 await realWorkflow.recordSubmission(pool,rows[2],{id:mod},'confirmed');
 assert.equal((await db.query('SELECT count(*)::int n FROM moderator_work_history WHERE order_id=$1',[ids[2]])).rows[0].n,2);
 assert.equal((await db.query('SELECT count(*)::int n FROM order_events')).rows[0].n,3);
 assert.equal((await db.query('SELECT count(*)::int n FROM order_request_tombstones')).rows[0].n,0);
});
