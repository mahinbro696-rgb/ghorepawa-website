import {endpoint,body,rate,secretMatches} from '../server/http.mjs';
import {transaction,getPool} from '../server/db.mjs';
import {provisionUser} from '../server/auth.mjs';
import {AppError,text,username,password} from '../server/domain.mjs';
export default endpoint(['GET','POST'],async(req,res)=>{
  if(req.method==='GET'){
    const {rows}=await getPool().query("SELECT EXISTS(SELECT 1 FROM team_members WHERE role='admin') AS configured");
    return res.json({configured:rows[0].configured});
  }
  await rate(req,'setup',5,3600);
  const data=await body(req);
  if(!secretMatches(data.token,process.env.ADMIN_SETUP_HASH))throw new AppError(403,'সেটআপ কোডটি সঠিক নয়।');
  const input={name:text(data.name,'নাম',2,100),username:username(data.username),password:password(data.password)};
  await transaction(async client=>{
    await client.query('SELECT pg_advisory_xact_lock(823709416)');
    const count=await client.query("SELECT id FROM team_members WHERE role='admin'");
    if(count.rows.length)throw new AppError(409,'অ্যাডমিন অ্যাকাউন্ট ইতোমধ্যে তৈরি হয়েছে।');
    const result=await provisionUser(input);
    await client.query("INSERT INTO team_members(id,username,name,role,status) VALUES($1,$2,$3,'admin','active')",[result.user.id,input.username,input.name]);
    await client.query("UPDATE team_auth_users SET role='admin' WHERE id=$1",[result.user.id]);
    await client.query("INSERT INTO team_events(actor_id,target_id,kind) VALUES($1,$1,'owner-created')",[result.user.id]);
  });
  res.status(201).json({ok:true});
});
