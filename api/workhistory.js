import {endpoint,actor} from '../server/http.mjs';
import {getPool} from '../server/db.mjs';
import {AppError} from '../server/domain.mjs';
export default endpoint(['GET'],async(req,res)=>{
  const member=await actor(req);
  const q=new URL(req.url,'https://local').searchParams;
  const page=Math.max(1,Math.min(100000,Number(q.get('page'))||1));
  if(!Number.isInteger(page))throw new AppError(400,'Invalid page.');
  // A moderator can never select another identity, even by manually changing a URL.
  const id=member.role==='admin'?(q.get('member')||member.id):member.id;
  const [items,count]=await Promise.all([
    getPool().query(`SELECT h.id::text,o.reference,h.outcome,h.submitted_at
      FROM moderator_work_history h JOIN shop_orders o ON o.id=h.order_id
      WHERE h.moderator_id=$1 ORDER BY h.id DESC LIMIT 30 OFFSET $2`,[id,(page-1)*30]),
    getPool().query('SELECT count(*)::int AS count FROM moderator_work_history WHERE moderator_id=$1',[id])
  ]);
  // No order ID/detail link, name, phone, location, note, price or other staff data.
  res.json({items:items.rows,total:count.rows[0].count,page,pageSize:30});
});
