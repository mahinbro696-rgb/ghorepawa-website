import {endpoint,body,headers,rate,sendAuthResponse} from '../server/http.mjs';
import {getAuth,staffEmail} from '../server/auth.mjs';
import {getPool} from '../server/db.mjs';
import {AppError,username,text} from '../server/domain.mjs';
export default endpoint(['POST'],async(req,res)=>{
  await rate(req,'login-ip',30,900);
  const data=await body(req),id=username(data.username);
  await rate(req,'login-user',12,900,id);
  const result=await getAuth().api.signInEmail({body:{email:staffEmail(id),password:text(data.password,'পাসওয়ার্ড',1,128)},headers:headers(req),asResponse:true});
  if(!result.ok)return res.status(401).json({error:'ইউজার আইডি বা পাসওয়ার্ড সঠিক নয়।'});
  const {rows}=await getPool().query('SELECT status FROM team_members WHERE username=$1',[id]);
  if(rows[0]?.status!=='active')throw new AppError(403,'অ্যাডমিনের অনুমোদন প্রয়োজন অথবা অ্যাকাউন্ট বন্ধ রয়েছে।');
  return sendAuthResponse(res,result);
});
