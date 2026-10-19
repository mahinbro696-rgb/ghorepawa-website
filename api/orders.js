import {LANDING_PRODUCT_ID} from '../server/products.mjs';
import {endpoint,actor,body,rate,digest} from '../server/http.mjs';
import {transaction,getPool} from '../server/db.mjs';
import {AppError,parseOrder,uuid,text,transition,canAssign,statuses,labels} from '../server/domain.mjs';
export default endpoint(['GET','POST','PATCH'],async(req,res)=>{
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
    const existing=(await getPool().query('SELECT reference,total,fingerprint,product_id FROM shop_orders WHERE request_key=$1',[key])).rows[0];
    if(existing){verify(existing);return res.json({reference:existing.reference,total:existing.total});}
    await rate(req,'order-ip',15,900);await rate(req,'order-phone',5,3600,order.phone);
    const result=await transaction(async client=>{
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
    const url=new URL(req.url,'https://local');const search=(url.searchParams.get('q')||'').trim().slice(0,100),status=url.searchParams.get('status')||'',assignee=url.searchParams.get('assignee')||'';
    const page=Math.max(1,Math.min(100000,Number(url.searchParams.get('page'))||1));if(!Number.isInteger(page))throw new AppError(400,'পেজ সঠিক নয়।');
    const params=[],where=[];const add=(sql,value)=>{params.push(value);where.push(sql.replace('?',`$${params.length}`));};
    if(user.role!=='admin')add('o.assigned_to=?',user.id);
    if(url.searchParams.get('id'))add('o.id=?',uuid(url.searchParams.get('id')));
    if(status){if(!statuses.includes(status))throw new AppError(400,'অবস্থা সঠিক নয়।');add('o.status=?',status);}
    if(assignee&&user.role==='admin'){if(assignee==='unassigned')where.push('o.assigned_to IS NULL');else add('o.assigned_to=?',assignee);}
    if(search){params.push(`%${search.replace(/[\\%_]/g,'\\$&')}%`);const p=`$${params.length}`;where.push(`(o.customer_name ILIKE ${p} OR o.phone ILIKE ${p} OR ('ES-'||o.reference::text) ILIKE ${p})`);}
    const predicate=where.length?'WHERE '+where.join(' AND '):'';
    const values=[...params,30,(page-1)*30];
    const [count,result,stats]=await Promise.all([
      getPool().query(`SELECT count(*)::int AS count FROM shop_orders o ${predicate}`,params),
      getPool().query(`SELECT o.*,m.name AS assigned_name,${user.role==='admin'?"(SELECT count(*)::int FROM shop_orders d WHERE d.phone=o.phone)":"1"} AS phone_orders FROM shop_orders o LEFT JOIN team_members m ON m.id=o.assigned_to ${predicate} ORDER BY o.created_at DESC,o.id LIMIT $${values.length-1} OFFSET $${values.length}`,values),
      getPool().query(`SELECT status,count(*)::int AS count FROM shop_orders ${user.role==='admin'?'':'WHERE assigned_to=$1'} GROUP BY status`,user.role==='admin'?[]:[user.id])
    ]);
    return res.json({orders:result.rows,total:count.rows[0].count,page,pageSize:30,stats:Object.fromEntries(stats.rows.map(s=>[s.status,s.count])),labels});
  }
  const data=await body(req);
  if(data.action==='assign'){
    if(user.role!=='admin')throw new AppError(403,'শুধু অ্যাডমিন বরাদ্দ দিতে পারবেন।');
    if(!Array.isArray(data.ids)||!data.ids.length||data.ids.length>200)throw new AppError(400,'১–২০০টি অর্ডার নির্বাচন করুন।');
    const ids=[...new Set(data.ids.map(uuid))].sort(),target=text(data.assignee,'মডারেটর',1,100);
    await transaction(async client=>{
      const staff=(await client.query("SELECT id,name FROM team_members WHERE id=$1 AND role='moderator' AND status='active' FOR SHARE",[target])).rows[0];
      if(!staff)throw new AppError(400,'সক্রিয় মডারেটর নির্বাচন করুন।');
      const rows=(await client.query('SELECT id,status,assigned_to FROM shop_orders WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[ids])).rows;
      if(rows.length!==ids.length||rows.some(o=>!canAssign(o)))throw new AppError(409,'কিছু অর্ডারের অবস্থা বদলেছে বা বরাদ্দযোগ্য নয়। তালিকা রিফ্রেশ করুন।');
      await client.query("UPDATE shop_orders SET assigned_to=$2,status='assigned',assigned_at=now(),callback_at=NULL,updated_at=now(),version=version+1 WHERE id=ANY($1::uuid[])",[ids,target]);
      for(const o of rows)await client.query("INSERT INTO order_events(order_id,actor_id,kind,from_status,to_status,note) VALUES($1,$2,'assigned',$3,'assigned',$4)",[o.id,user.id,o.status,`মডারেটর: ${staff.name}`]);
    });return res.json({ok:true,count:ids.length});
  }
  const id=uuid(data.id),note=text(data.note||'','নোট',0,1500);
  await transaction(async client=>{
    const order=(await client.query('SELECT * FROM shop_orders WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!order)throw new AppError(404,'অর্ডার পাওয়া যায়নি।');
    if(user.role!=='admin'&&order.assigned_to!==user.id)throw new AppError(403,'অর্ডারটি আপনার নয়।');
    if(!Number.isInteger(data.version)||data.version!==order.version)throw new AppError(409,'অর্ডারটি ইতোমধ্যে বদলেছে। আবার খুলে চেষ্টা করুন।');
    if(data.action==='note'){
      if(!note)throw new AppError(400,'নোট লিখুন।');
      if(user.role!=='admin'&&!['assigned','callback'].includes(order.status))throw new AppError(409,'অর্ডারটি অ্যাডমিনের কাছে জমা হয়েছে।');
      await client.query('UPDATE shop_orders SET latest_note=$2,updated_at=now(),version=version+1 WHERE id=$1',[id,note]);
      await client.query("INSERT INTO order_events(order_id,actor_id,kind,note) VALUES($1,$2,'note',$3)",[id,user.id,note]);return;
    }
    if(data.action!=='status')throw new AppError(400,'কাজটি সঠিক নয়।');
    transition(user,order,data.status,note,data.callbackAt);
    const callback=data.status==='callback'?new Date(data.callbackAt):null;
    if(data.status==='cancelled'&&order.stock_reserved&&order.product_id){
      await client.query('UPDATE shop_products SET stock=CASE WHEN stock IS NULL THEN NULL ELSE stock+$2 END,version=version+1,updated_at=now() WHERE id=$1',[order.product_id,order.quantity]);
      await client.query('UPDATE shop_orders SET stock_reserved=false WHERE id=$1',[id]);
      await client.query("INSERT INTO product_events(product_id,actor_id,kind,details) VALUES($1,$2,'stock-returned',$3)",[order.product_id,user.id,JSON.stringify({orderId:id,quantity:order.quantity})]);
    }

    await client.query('UPDATE shop_orders SET status=$2,latest_note=$3,callback_at=$4,updated_at=now(),version=version+1 WHERE id=$1',[id,data.status,note,callback]);
    await client.query("INSERT INTO order_events(order_id,actor_id,kind,from_status,to_status,note) VALUES($1,$2,'status',$3,$4,$5)",[id,user.id,order.status,data.status,note]);
  });res.json({ok:true});
});
