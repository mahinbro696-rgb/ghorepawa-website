import {endpoint,actor,body,headers,rate} from '../server/http.mjs';
import {transaction,getPool} from '../server/db.mjs';
import {provisionUser,getAuth} from '../server/auth.mjs';
import {AppError,text,username,password} from '../server/domain.mjs';
export default endpoint(['GET','POST','PATCH'],async(req,res)=>{
  const admin=await actor(req,true);
  if(req.method==='GET'){
    const {rows}=await getPool().query(`SELECT m.id,m.username,m.name,m.role,m.status,m.created_at,
      count(o.id)::int AS total_orders,
      count(o.id) FILTER(WHERE o.status IN('assigned','callback'))::int AS pending_orders,
      count(o.id) FILTER(WHERE o.status IN('confirmed','approved','dispatched','delivered'))::int AS confirmed_orders,
      count(o.id) FILTER(WHERE o.status='unapproved')::int AS unapproved_orders
      FROM team_members m LEFT JOIN shop_orders o ON o.assigned_to=m.id GROUP BY m.id ORDER BY m.created_at`);
    return res.json({members:rows});
  }
  const data=await body(req);
  if(req.method==='POST'){
    await rate(req,'team-create',50,3600,admin.id);
    const input={name:text(data.name,'নাম',2,100),username:username(data.username),password:password(data.password)};
    if((await getPool().query('SELECT 1 FROM team_members WHERE username=$1',[input.username])).rows.length)throw new AppError(409,'এই ইউজার আইডি ইতোমধ্যে ব্যবহার হচ্ছে।');
    let result;
    try{result=await provisionUser(input);}catch{throw new AppError(409,'অ্যাকাউন্ট তৈরি হয়নি। ইউজার আইডি পরিবর্তন করে চেষ্টা করুন।');}
    await transaction(async client=>{
      await client.query("INSERT INTO team_members(id,username,name,role,status) VALUES($1,$2,$3,'moderator','pending')",[result.user.id,input.username,input.name]);
      await client.query("INSERT INTO team_events(actor_id,target_id,kind) VALUES($1,$2,'member-created')",[admin.id,result.user.id]);
    });
    return res.status(201).json({ok:true});
  }
  const id=text(data.id,'সদস্য',1,100);
  if(data.action==='password'){
    const member=(await getPool().query('SELECT id,role FROM team_members WHERE id=$1',[id])).rows[0];
    if(!member||member.role==='admin')throw new AppError(400,'মডারেটর নির্বাচন করুন।');
    await getAuth().api.setUserPassword({headers:headers(req),body:{userId:id,newPassword:password(data.password)}});
    await getPool().query('DELETE FROM team_auth_sessions WHERE "userId"=$1',[id]);
    await getPool().query("INSERT INTO team_events(actor_id,target_id,kind) VALUES($1,$2,'password-reset')",[admin.id,id]);
    return res.json({ok:true});
  }
  if(!['active','disabled'].includes(data.status))throw new AppError(400,'অবস্থা সঠিক নয়।');
  await transaction(async client=>{
    const member=(await client.query('SELECT * FROM team_members WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!member||member.role==='admin')throw new AppError(400,'মূল অ্যাডমিন বন্ধ করা যাবে না।');
    await client.query('UPDATE team_members SET status=$2 WHERE id=$1',[id,data.status]);
    if(data.status==='disabled')await client.query('DELETE FROM team_auth_sessions WHERE "userId"=$1',[id]);
    await client.query('INSERT INTO team_events(actor_id,target_id,kind) VALUES($1,$2,$3)',[admin.id,id,`member-${data.status}`]);
  });res.json({ok:true});
});
