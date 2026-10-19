import {endpoint,actor,body,headers,sendAuthResponse} from '../server/http.mjs';
import {getAuth} from '../server/auth.mjs';
import {AppError,password,text} from '../server/domain.mjs';
export default endpoint(['GET','POST'],async(req,res)=>{
  const member=await actor(req);
  if(req.method==='GET')return res.json({user:member});
  const data=await body(req);
  if(data.action==='logout')return sendAuthResponse(res,await getAuth().api.signOut({headers:headers(req),asResponse:true}));
  if(data.action==='password'){
    const result=await getAuth().api.changePassword({headers:headers(req),body:{currentPassword:text(data.currentPassword,'বর্তমান পাসওয়ার্ড',1,128),newPassword:password(data.newPassword),revokeOtherSessions:true},asResponse:true});
    if(!result.ok)throw new AppError(400,'বর্তমান পাসওয়ার্ড সঠিক নয় অথবা পরিবর্তন করা যায়নি।');
    return sendAuthResponse(res,result);
  }
  throw new AppError(400,'কাজটি সঠিক নয়।');
});
