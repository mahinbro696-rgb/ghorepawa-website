import {endpoint,actor,body,headers,rate,sendAuthResponse} from '../server/http.mjs';
import {getAuth} from '../server/auth.mjs';
import {getPool} from '../server/db.mjs';
import {AppError,text} from '../server/domain.mjs';
import QRCode from 'qrcode';
export default endpoint(['GET','POST'],async(req,res)=>{
 if(req.method==='GET'){const member=await actor(req);return res.json({enabled:member.twoFactorEnabled});}
 const data=await body(req);
 await rate(req,'two-factor',20,600);
 const auth=getAuth(),common={headers:headers(req),asResponse:true};
 if(data.action==='verify'||data.action==='recover'){
  const code=text(data.code,'কোড',6,100);
  if(data.action==='verify'&&!/^\d{6}$/.test(code))throw new AppError(400,'৬ সংখ্যার কোড লিখুন।');
  const result=await (data.action==='verify'?auth.api.verifyTOTP:auth.api.verifyBackupCode)({...common,body:{code,trustDevice:false}});
  if(!result.ok)throw new AppError(400,'কোড সঠিক নয় অথবা মেয়াদ শেষ। নতুন কোড দিয়ে চেষ্টা করুন।');
  return sendAuthResponse(res,result);
 }
 const member=await actor(req);
 const password=text(data.password,'বর্তমান পাসওয়ার্ড',1,128);
 if(data.action==='enable'){
  const result=await auth.api.enableTwoFactor({...common,body:{password,issuer:'Ever Strong',method:'totp'}});
  if(!result.ok)throw new AppError(400,'পাসওয়ার্ড সঠিক নয় অথবা 2FA ইতোমধ্যে চালু রয়েছে।');
  const payload=await result.json();
  const cookies=result.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);
  const qr=await QRCode.toDataURL(payload.totpURI,{width:240,margin:2});
  await getPool().query("INSERT INTO team_events(actor_id,target_id,kind) VALUES($1,$1,'2fa-enrollment-started')",[member.id]);
  return res.json({qr,secret:new URL(payload.totpURI).searchParams.get('secret'),backupCodes:payload.backupCodes});
 }
 if(data.action==='disable'){
  // Require the existing second factor as well as password for sensitive disable.
  const code=text(data.code,'Authenticator কোড',6,6);
  const verified=await auth.api.verifyTOTP({...common,body:{code,trustDevice:false}});
  if(!verified.ok)throw new AppError(400,'Authenticator কোড সঠিক নয়।');
  const result=await auth.api.disableTwoFactor({...common,body:{password}});
  if(!result.ok)throw new AppError(400,'পাসওয়ার্ড সঠিক নয় অথবা পরিবর্তন করা যায়নি।');
  await getPool().query("INSERT INTO team_events(actor_id,target_id,kind) VALUES($1,$1,'2fa-disabled')",[member.id]);
  return sendAuthResponse(res,result);
 }
 throw new AppError(400,'কাজটি সঠিক নয়।');
});
