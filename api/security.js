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
  const code=text(data.code,'Code',6,100);
  if(data.action==='verify'&&!/^\d{6}$/.test(code))throw new AppError(400,'Enter a 6-digit code.');
  const before=await auth.api.getSession({headers:headers(req)});
  const result=await (data.action==='verify'?auth.api.verifyTOTP:auth.api.verifyBackupCode)({...common,body:{code,trustDevice:false}});
  if(!result.ok)throw new AppError(400,'The code is incorrect or expired. Try a new code.');
  const nextHeaders=headers(req),cookies=new Map((nextHeaders.get('cookie')||'').split(';').filter(Boolean).map(pair=>{const i=pair.indexOf('=');return [pair.slice(0,i).trim(),pair.slice(i+1)];}));
  for(const cookie of result.headers.getSetCookie()){const pair=cookie.split(';')[0],i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1));}
  nextHeaders.set('cookie',[...cookies].map(([key,value])=>key+'='+value).join('; '));
  const current=await auth.api.getSession({headers:nextHeaders});
  if(!current)throw new AppError(401,'Please sign in again.');
  const staff=(await getPool().query('SELECT status FROM team_members WHERE id=$1',[current.user.id])).rows[0];
  if(staff?.status!=='active')throw new AppError(403,'This account is not active.');
  if(before&&!before.user.twoFactorEnabled&&current.user.twoFactorEnabled){
   await getPool().query('DELETE FROM team_auth_sessions WHERE "userId"=$1 AND id<>$2',[current.user.id,current.session.id]);
   await getPool().query("INSERT INTO team_events(actor_id,target_id,kind) VALUES($1,$1,'2fa-enabled')",[current.user.id]);
  }
  return sendAuthResponse(res,result);
 }
 const member=await actor(req);
 const password=text(data.password,'Current password',1,128);
 if(data.action==='enable'){
  const result=await auth.api.enableTwoFactor({...common,body:{password,issuer:'Ever Strong',method:'totp'}});
  if(!result.ok)throw new AppError(400,'Incorrect password or two-factor authentication is already enabled.');
  const payload=await result.json();
  const cookies=result.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);
  const qr=await QRCode.toDataURL(payload.totpURI,{width:240,margin:2});
  await getPool().query("INSERT INTO team_events(actor_id,target_id,kind) VALUES($1,$1,'2fa-enrollment-started')",[member.id]);
  return res.json({qr,secret:new URL(payload.totpURI).searchParams.get('secret'),backupCodes:payload.backupCodes});
 }
 if(data.action==='disable'){
  // Require the existing second factor as well as password for sensitive disable.
  const code=text(data.code,'Authenticator / recovery code',6,100);
  const verified=await (/^\d{6}$/.test(code)?auth.api.verifyTOTP:auth.api.verifyBackupCode)({...common,body:{code,trustDevice:false}});
  if(!verified.ok)throw new AppError(400,'Incorrect Authenticator code.');
  const result=await auth.api.disableTwoFactor({...common,body:{password}});
  if(!result.ok)throw new AppError(400,'Incorrect password or the change could not be saved.');
  await getPool().query("INSERT INTO team_events(actor_id,target_id,kind) VALUES($1,$1,'2fa-disabled')",[member.id]);
  return sendAuthResponse(res,result);
 }
 throw new AppError(400,'Invalid action.');
});
