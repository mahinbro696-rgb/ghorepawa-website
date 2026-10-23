import {endpoint,actor} from '../server/http.mjs';
import {getPool} from '../server/db.mjs';
import {AppError,uuid} from '../server/domain.mjs';
export default endpoint(['GET'],async(req,res)=>{
 const user=await actor(req,true),id=uuid(new URL(req.url,'https://local').searchParams.get('id'));
 const order=(await getPool().query('SELECT assigned_to FROM shop_orders WHERE id=$1',[id])).rows[0];
 if(!order)throw new AppError(404,'Order not found.');
 if(user.role!=='admin'&&order.assigned_to!==user.id)throw new AppError(403,'This order is not assigned to you.');
 const {rows}=await getPool().query(`SELECT e.id,e.kind,e.from_status,e.to_status,e.note,e.created_at,m.name AS actor_name FROM order_events e LEFT JOIN team_members m ON m.id=e.actor_id WHERE e.order_id=$1 ORDER BY e.id DESC LIMIT 200`,[id]);
 res.json({events:rows});
});
