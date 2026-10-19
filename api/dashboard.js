import {endpoint,actor} from '../server/http.mjs';
import {getPool} from '../server/db.mjs';
export default endpoint(['GET'],async(req,res)=>{
  const user=await actor(req);
  if(user.role!=='admin'){
    const {rows}=await getPool().query("SELECT count(*)::int AS inbox,count(*) FILTER(WHERE status='callback')::int AS callbacks FROM shop_orders WHERE assigned_to=$1 AND status IN('assigned','callback')",[user.id]);
    return res.json({work:rows[0]});
  }
  const args=[];
  const scope=user.role==='admin'?'TRUE':'assigned_to=$1';
  const [totals,daily,recent]=await Promise.all([
    getPool().query(`SELECT count(*)::int AS orders,
      count(*) FILTER(WHERE (created_at AT TIME ZONE 'Asia/Dhaka')::date=(now() AT TIME ZONE 'Asia/Dhaka')::date)::int AS today,
      COALESCE(sum(total) FILTER(WHERE status='delivered'),0)::text AS collected,
      COALESCE(sum(total) FILTER(WHERE status NOT IN('cancelled','delivered','unapproved')),0)::text AS pipeline,
      count(*) FILTER(WHERE status='new')::int AS new_orders,
      count(*) FILTER(WHERE status='confirmed')::int AS review,
      count(*) FILTER(WHERE status='delivered')::int AS delivered,
      count(*) FILTER(WHERE status='callback' AND callback_at<=now())::int AS overdue,
      count(*) FILTER(WHERE status IN('assigned','callback'))::int AS to_call
      FROM shop_orders WHERE ${scope}`,args),
    getPool().query(`SELECT (created_at AT TIME ZONE 'Asia/Dhaka')::date::text AS day,count(*)::int AS count,COALESCE(sum(total),0)::text AS value
      FROM shop_orders WHERE ${scope} AND created_at>=(((now() AT TIME ZONE 'Asia/Dhaka')::date-6)::timestamp AT TIME ZONE 'Asia/Dhaka')
      GROUP BY day ORDER BY day`,args),
    getPool().query(`SELECT id,reference,customer_name,phone,district,area,address,quantity,unit_price,total,status,assigned_to,callback_at,latest_note,version,created_at,product_name
      FROM shop_orders WHERE ${scope} ORDER BY created_at DESC,id LIMIT 6`,args)
  ]);
  res.json({totals:totals.rows[0],daily:daily.rows,recent:recent.rows,asOf:new Date().toISOString()});
});
