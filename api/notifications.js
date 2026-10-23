import {endpoint,actor,body} from '../server/http.mjs';
import {getPool} from '../server/db.mjs';
import {AppError,uuid} from '../server/domain.mjs';
export default endpoint(['GET','PATCH'],async(req,res)=>{
  const user=await actor(req),pool=getPool();
  const scope=user.role==='admin'?'TRUE':"o.assigned_to=$1 AND o.status IN('assigned','callback') AND e.kind='assigned' AND e.created_at>=o.assigned_at";
  const where=`${scope} AND e.kind IN('created','assigned','status') AND (e.actor_id IS NULL OR e.actor_id<>$1)`;
  const summary=await pool.query(`SELECT COALESCE(max(e.id),0)::text AS latest,
    count(*) FILTER(WHERE e.id>COALESCE((SELECT read_through FROM portal_notice_state WHERE user_id=$1),0))::int AS unread
    FROM order_events e JOIN shop_orders o ON o.id=e.order_id WHERE ${where}`,[user.id]);
  const latest=summary.rows[0].latest;
  if(req.method==='PATCH'){
    const data=await body(req),through=String(data.through??'');
    if(!/^\d{1,18}$/.test(through))throw new AppError(400,'Invalid notification cursor.');
    const safe=(BigInt(through)>BigInt(latest)?BigInt(latest):BigInt(through)).toString();
    await pool.query(`INSERT INTO portal_notice_state(user_id,read_through) VALUES($1,$2)
      ON CONFLICT(user_id) DO UPDATE SET read_through=GREATEST(portal_notice_state.read_through,EXCLUDED.read_through),updated_at=now()`,[user.id,safe]);
    return res.json({ok:true});
  }
  const before=new URL(req.url,'https://local').searchParams.get('before');
  if(before&&!/^\d{1,18}$/.test(before))throw new AppError(400,'Invalid notification cursor.');
  const values=before?[user.id,before]:[user.id];
  const [items,state,due]=await Promise.all([
    pool.query(`SELECT e.id::text,e.order_id,e.kind,e.to_status,e.created_at,o.reference
      FROM order_events e JOIN shop_orders o ON o.id=e.order_id WHERE ${where} ${before?'AND e.id<$2':''} ORDER BY e.id DESC LIMIT 31`,values),
    pool.query('SELECT read_through::text FROM portal_notice_state WHERE user_id=$1',[user.id]),
    pool.query(`SELECT count(*)::int AS count FROM shop_orders o WHERE ${user.role==='admin'?'TRUE':'o.assigned_to=$1'} AND status='callback' AND callback_at<=now()`,user.role==='admin'?[]:[user.id])
  ]);
  let accessibleIds;
  if(user.role!=='admin'){
    const query=new URL(req.url,'https://local').searchParams;
    const sharedList=query.get('scope')==='all';
    const tracked=query.get('tracked')||'';
    const ids=tracked?tracked.split(','):[];
    if(ids.length>31)throw new AppError(400,'Too many tracked orders.');
    ids.forEach(uuid);
    accessibleIds=ids.length?(await pool.query(sharedList
      ? 'SELECT id FROM shop_orders WHERE id=ANY($1::uuid[])'
      : "SELECT id FROM shop_orders WHERE assigned_to=$1 AND status IN('assigned','callback') AND id=ANY($2::uuid[])",
      sharedList?[ids]:[user.id,ids])).rows.map(o=>o.id):[];
  }
  res.json({accessibleIds,items:items.rows.slice(0,30),hasMore:items.rows.length>30,latestId:latest,unread:summary.rows[0].unread,readThrough:state.rows[0]?.read_through||'0',due:due.rows[0].count});
});
