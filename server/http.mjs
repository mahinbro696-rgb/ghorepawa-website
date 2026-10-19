import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {getAuth} from './auth.mjs';
import {getPool} from './db.mjs';
import {ensureSchema} from './schema.mjs';
import {AppError} from './domain.mjs';
export function headers(req){return new Headers(Object.entries(req.headers).flatMap(([k,v])=>v===undefined?[]:[[k,Array.isArray(v)?v.join(','):v]]));}
export function origin(req){return process.env.APP_ORIGIN || `https://${req.headers.host}`;}
export function protectOrigin(req){
  if(req.method==='GET')return;
  if(req.headers['sec-fetch-site']==='cross-site')throw new AppError(403,'অন্য ওয়েবসাইট থেকে এই অনুরোধ গ্রহণ করা যাবে না।');
  const incoming=req.headers.origin;
  if(incoming && incoming!==origin(req))throw new AppError(403,'অনুরোধের উৎস সঠিক নয়।');
  if(!String(req.headers['content-type']||'').startsWith('application/json'))throw new AppError(415,'JSON অনুরোধ প্রয়োজন।');
}
export async function body(req){
  if(Number(req.headers['content-length']||0)>12000)throw new AppError(413,'অনুরোধটি খুব বড়।');
  if(req.body!==undefined){let b=req.body;if(typeof b==='string'){try{b=JSON.parse(b)}catch{throw new AppError(400,'তথ্যের বিন্যাস সঠিক নয়।')}}if(JSON.stringify(b).length>12000)throw new AppError(413,'অনুরোধটি খুব বড়।');if(!b||typeof b!=='object'||Array.isArray(b))throw new AppError(400,'তথ্যের বিন্যাস সঠিক নয়।');return b;}
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>12000)throw new AppError(413,'অনুরোধটি খুব বড়।');}
  try{const result=JSON.parse(raw||'{}');if(!result||typeof result!=='object'||Array.isArray(result))throw Error();return result;}catch{throw new AppError(400,'তথ্যের বিন্যাস সঠিক নয়।');}
}
export function endpoint(methods,handler){return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
  try{
    if(!methods.includes(req.method)){res.setHeader('Allow',methods.join(', '));throw new AppError(405,'এই অনুরোধটি সমর্থিত নয়।');}
    protectOrigin(req);await ensureSchema();await handler(req,res);
  }catch(error){
    const status=Number.isInteger(error.status)?error.status:({UNAUTHORIZED:401,FORBIDDEN:403,BAD_REQUEST:400,CONFLICT:409,TOO_MANY_REQUESTS:429}[error.status]||500);
    if(status>=500)console.error('API failure',{type:error.name,code:error.code||'unknown'});
    if(!res.headersSent)res.status(status).json({error:status>=500?'সার্ভারের সঙ্গে যোগাযোগে সমস্যা হয়েছে। আবার চেষ্টা করুন।':error.message});
  }
};}
export async function actor(req,adminOnly=false){
  const session=await getAuth().api.getSession({headers:headers(req)});
  if(!session)throw new AppError(401,'লগইন করুন।');
  const {rows}=await getPool().query('SELECT id,username,name,role,status FROM team_members WHERE id=$1',[session.user.id]);
  const member=rows[0];
  if(!member||member.status!=='active')throw new AppError(403,'অ্যাকাউন্টটি সক্রিয় নেই। অ্যাডমিনের সঙ্গে যোগাযোগ করুন।');
  if(adminOnly&&member.role!=='admin')throw new AppError(403,'শুধু অ্যাডমিন এই কাজ করতে পারবেন।');
  return member;
}
export const digest=value=>createHash('sha256').update(value).digest('hex');
export function secretMatches(value,hash){if(typeof value!=='string'||!hash)return false;const a=Buffer.from(digest(value));const b=Buffer.from(hash);return a.length===b.length&&timingSafeEqual(a,b);}
export async function rate(req,scope,max=10,seconds=900,identity=''){
  const ip=req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown';
  const key=createHmac('sha256',process.env.BETTER_AUTH_SECRET).update(`${scope}:${identity||String(ip).split(',')[0]}`).digest('hex');
  const {rows}=await getPool().query(`INSERT INTO request_limits(key,hits,expires_at) VALUES($1,1,now()+$2*interval '1 second')
  ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN request_limits.expires_at<now() THEN 1 ELSE request_limits.hits+1 END,
  expires_at=CASE WHEN request_limits.expires_at<now() THEN EXCLUDED.expires_at ELSE request_limits.expires_at END RETURNING hits`,[key,seconds]);
  if(rows[0].hits>max)throw new AppError(429,'অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।');
}
export function sendAuthResponse(res,response){
  const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);
  res.status(response.status);return response.text().then(t=>{res.setHeader('Content-Type','application/json');res.end(t)});
}
