import {appendOrderSearch} from '../server/order-search.mjs';
import {ACTIVE_WORK,canWork,recordSubmission,eraseOrder,erasedKey,lockRequest} from '../server/workflow.mjs';
import {LANDING_PRODUCT_ID} from '../server/products.mjs';
import {endpoint,actor,body,rate,digest} from '../server/http.mjs';
import {transaction,getPool} from '../server/db.mjs';
import {AppError,parseOrder,uuid,text,transition,canAssign,statuses,labels} from '../server/domain.mjs';
export default endpoint(['GET','POST','PATCH','DELETE'],async(req,res)=>{
  if(req.method==='POST'){
    const data=await body(req);
    if(data.website)throw new AppError(400,'অনুরোধটি গ্রহণ করা যায়নি।');
    const order=parseOrder(data),key=uuid(req.headers['idempotency-key']);
    const productId=data.productId?uuid(data.productId):LANDING_PRODUCT_ID;
    // Hash only normalized customer intent, not mutable catalog pricing.
    const {unitPrice:ignoredPrice,total:ignoredTotal,...intent}=order;
    const fingerprint=digest(JSON.stringify({...intent,productId}));
    const legacy=digest(JSON.stringify(order));
    const verify=record=>{
      if(record.fingerprint!==fingerprint && !(record.product_id===null&&productId===LANDING_PRODUCT_ID&&record.fingerprint===legacy))throw new AppError(409,'Order details changed. Submit a new request.');
      return record;
    };
    if((await getPool().query('SELECT 1 FROM order_request_tombstones WHERE request_digest=$1',[erasedKey(key)])).rows.length)throw new AppError(410,'This request was removed. Do not retry the deleted order.');
    const existing=(await getPool().query('SELECT reference,total,fingerprint,product_id FROM shop_orders WHERE request_key=$1',[key])).rows[0];
    if(existing){verify(existing);return res.json({reference:existing.reference,total:existing.total});}
    await rate(req,'order-ip',15,900);await rate(req,'order-phone',5,3600,order.phone);
    const result=await transaction(async client=>{
      await lockRequest(client,key);
      if((await client.query('SELECT 1 FROM order_request_tombstones WHERE request_digest=$1',[erasedKey(key)])).rows.length)throw new AppError(410,'This request was removed.');
      const product=(await client.query('SELECT * FROM shop_products WHERE id=$1 FOR UPDATE',[productId])).rows[0];
      const retry=(await client.query('SELECT reference,total,fingerprint,product_id FROM shop_orders WHERE request_key=$1',[key])).rows[0];
      if(retry)return verify(retry);
      if(!product||!product.active)throw new AppError(409,'This product is unavailable. Please refresh the page.');
      if(product.stock!==null&&product.stock<order.quantity)throw new AppError(409,'Not enough stock for this quantity.');
      const expected=data.expectedUnitPrice===undefined?399:Number(data.expectedUnitPrice);
      if(expected!==product.price)throw new AppError(409,'The price has changed. Refresh the page and check the new price.');
      const {rows}=await client.query(`INSERT INTO shop_orders(request_key,fingerprint,customer_name,phone,district,area,address,quantity,unit_price,total,product_id,product_name,stock_reserved)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(request_key) DO NOTHING RETURNING id,reference,total`,
        [key,fingerprint,order.name,order.phone,order.district,order.area,order.address,order.quantity,product.price,order.quantity*product.price,product.id,product.name,product.stock!==null]);
      if(!rows.length)return verify((await client.query('SELECT reference,total,fingerprint,product_id FROM shop_orders WHERE request_key=$1',[key])).rows[0]);
      if(product.stock!==null)await client.query('UPDATE shop_products SET stock=stock-$2,version=version+1,updated_at=now() WHERE id=$1',[product.id,order.quantity]);
      await client.query("INSERT INTO order_events(order_id,kind,to_status) VALUES($1,'created','new')",[rows[0].id]);
      return rows[0];
    });return res.status(201).json({reference:result.reference,total:result.total});
  }

  const user=await actor(req);
  if(req.method==='GET'){
    const url=new URL(req.url,'https://local');
    const search=(url.searchParams.get('q')||'').trim().slice(0,100);
    const status=url.searchParams.get('status')||'',assignee=url.searchParams.get('assignee')||'';
    const section=url.searchParams.get('section')||'';
    const page=Math.max(1,Math.min(100000,Number(url.searchParams.get('page'))||1));
    if(!Number.isInteger(page))throw new AppError(400,'Invalid page.');
    const admin=user.role==='admin',params=[],where=[];
    const add=(sql,value)=>{params.push(value);where.push(sql.replace('?',`$${params.length}`));};
    if(!admin){add('o.assigned_to=?',user.id);where.push("o.status IN('assigned','callback')");}
    if(url.searchParams.get('id'))add('o.id=?',uuid(url.searchParams.get('id')));
    if(section==='callbacks')where.push("o.status='callback'");
    else if(section==='confirmed'&&admin)where.push('o.confirmed_by IS NOT NULL');
    else if(section==='cancelled'&&admin)where.push("o.status IN('cancelled','unapproved')");
    else if(section&&!['callbacks','confirmed','cancelled'].includes(section))throw new AppError(400,'Invalid order section.');
    if(status){if(!statuses.includes(status))throw new AppError(400,'Invalid status.');add('o.status=?',status);}
    if(assignee&&admin){if(assignee==='unassigned')where.push('o.assigned_to IS NULL');else add('o.assigned_to=?',assignee);}
    appendOrderSearch(search,params,where);
    const predicate=where.length?'WHERE '+where.join(' AND '):'';
    const values=[...params,30,(page-1)*30];
    // Never send financials, internal keys, other staff or audit records to moderators.
    const fields=admin?`o.*,m.name AS assigned_name,m.badge_number AS assigned_badge,
      cm.name AS confirmed_name,cm.badge_number AS confirmed_badge,
      (SELECT count(*)::int FROM shop_orders d WHERE d.phone=o.phone) AS phone_orders`:
      `o.id,o.reference,o.customer_name,o.phone,o.district,o.area,o.address,o.quantity,
       o.product_name,o.status,o.callback_at,o.callback_customer,o.latest_note,o.version,o.created_at,o.assigned_at`;
    const joins=admin?'LEFT JOIN team_members m ON m.id=o.assigned_to LEFT JOIN team_members cm ON cm.id=o.confirmed_by':'';
    const [count,result,stats]=await Promise.all([
      getPool().query(`SELECT count(*)::int AS count FROM shop_orders o ${predicate}`,params),
      getPool().query(`SELECT ${fields} FROM shop_orders o ${joins} ${predicate}
        ORDER BY ${!admin?'o.assigned_at DESC NULLS LAST,':''}o.created_at DESC,o.id
        LIMIT $${values.length-1} OFFSET $${values.length}`,values),
      getPool().query(`SELECT status,count(*)::int AS count FROM shop_orders
        ${admin?'':"WHERE assigned_to=$1 AND status IN('assigned','callback')"} GROUP BY status`,admin?[]:[user.id])
    ]);
    return res.json({orders:result.rows,total:count.rows[0].count,page,pageSize:30,
      stats:Object.fromEntries(stats.rows.map(x=>[x.status,x.count])),labels});
  }
  const data=await body(req);
  if(req.method==='DELETE'){
    if(user.role!=='admin')throw new AppError(403,'Only admin can permanently delete orders.');
    if(data.confirmPermanentDelete!==true)throw new AppError(400,'Explicit confirmation is required.');
    const id=uuid(data.id);
    await transaction(async c=>{
      const existing=(await c.query('SELECT request_key FROM shop_orders WHERE id=$1',[id])).rows[0];
      if(!existing)throw new AppError(404,'Order no longer exists.');
      await lockRequest(c,existing.request_key);
      const order=(await c.query('SELECT * FROM shop_orders WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(!order)throw new AppError(404,'Order no longer exists.');
      await eraseOrder(c,order,user,data);
    });return res.json({ok:true,deleted:true});
  }
  if(data.action==='assign'){
    if(user.role!=='admin')throw new AppError(403,'Only admin can assign orders.');
    if(!Array.isArray(data.ids)||!data.ids.length||data.ids.length>200)throw new AppError(400,'Select 1-200 orders.');
    const ids=[...new Set(data.ids.map(uuid))].sort(),target=text(data.assignee,'Moderator',1,100);
    await transaction(async c=>{
      const staff=(await c.query("SELECT id,name FROM team_members WHERE id=$1 AND role='moderator' AND status='active' FOR SHARE",[target])).rows[0];
      if(!staff)throw new AppError(400,'Select an active moderator.');
      const rows=(await c.query('SELECT id,status,assigned_to,version FROM shop_orders WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[ids])).rows;
      if(rows.length!==ids.length||rows.some(o=>!canAssign(o)))throw new AppError(409,'Some orders changed or cannot be assigned. Refresh the list.');
      // New UI sends expected versions; old API clients still retain status/row-lock safety.
      if(data.versions&&rows.some(o=>data.versions[o.id]!==o.version))throw new AppError(409,'An order changed. Refresh before assigning.');
      await c.query(`UPDATE shop_orders SET assigned_to=$2,
        status=CASE WHEN status='callback' THEN 'callback' ELSE 'assigned' END,
        callback_at=CASE WHEN status='callback' THEN callback_at ELSE NULL END,
        assigned_at=now(),assignment_round=assignment_round+1,updated_at=now(),version=version+1
        WHERE id=ANY($1::uuid[])`,[ids,target]);
      for(const o of rows)await c.query(`INSERT INTO order_events(order_id,actor_id,kind,from_status,to_status,note)
        VALUES($1,$2,'assigned',$3,$4,$5)`,[o.id,user.id,o.status,o.status==='callback'?'callback':'assigned',`Assigned to: ${staff.name}`]);
    });return res.json({ok:true,count:ids.length});
  }
  const id=uuid(data.id),note=text(data.note||'','Note',0,1500);
  await transaction(async c=>{
    const order=(await c.query('SELECT * FROM shop_orders WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!order)throw new AppError(404,'Order no longer exists.');
    if(user.role!=='admin'&&!canWork(order,user))throw new AppError(403,'This order is not in your inbox.');
    if(!Number.isInteger(data.version)||data.version!==order.version)throw new AppError(409,'This order changed. Reopen it and try again.');
    if(data.action==='note'){
      // A draft note is not a completed call. Submit a call result to hand work back.
      if(!note)throw new AppError(400,'Write a note.');
      await c.query('UPDATE shop_orders SET latest_note=$2,updated_at=now(),version=version+1 WHERE id=$1',[id,note]);
      await c.query("INSERT INTO order_events(order_id,actor_id,kind,note) VALUES($1,$2,'note',$3)",[id,user.id,note]);return;
    }
    if(data.action!=='status')throw new AppError(400,'Invalid action.');
    transition(user,order,data.status,note,data.callbackAt);
    const callback=data.status==='callback'?new Date(data.callbackAt):null;
    if(data.status==='cancelled'&&order.stock_reserved&&order.product_id){
      await c.query(`UPDATE shop_products SET stock=CASE WHEN stock IS NULL THEN NULL ELSE stock+$2 END,
        version=version+1,updated_at=now() WHERE id=$1`,[order.product_id,order.quantity]);
      await c.query('UPDATE shop_orders SET stock_reserved=false WHERE id=$1',[id]);
      await c.query("INSERT INTO product_events(product_id,actor_id,kind,details) VALUES($1,$2,'stock-returned',$3)",[order.product_id,user.id,JSON.stringify({orderId:id,quantity:order.quantity})]);
    }
    const moderator=user.role==='moderator';
    if(moderator)await recordSubmission(c,order,user,data.status);
    // Every submitted result leaves the moderator inbox in the same transaction.
    // Confirmation attribution is durable even after assignment is cleared.
    await c.query(`UPDATE shop_orders SET status=$2,latest_note=$3,callback_at=$4,
      callback_customer=callback_customer OR $2='callback',
      confirmed_by=CASE WHEN $2='confirmed' AND $5 THEN $6 ELSE confirmed_by END,
      assigned_to=CASE WHEN $5 OR $2 NOT IN('assigned','callback') THEN NULL ELSE assigned_to END,
      assigned_at=CASE WHEN $5 OR $2 NOT IN('assigned','callback') THEN NULL ELSE assigned_at END,
      updated_at=now(),version=version+1 WHERE id=$1`,[id,data.status,note,callback,moderator,user.id]);
    await c.query("INSERT INTO order_events(order_id,actor_id,kind,from_status,to_status,note) VALUES($1,$2,'status',$3,$4,$5)",[id,user.id,order.status,data.status,note]);
  });res.json({ok:true,returnedToAdmin:user.role==='moderator'&&data.action==='status'});
});
