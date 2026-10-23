import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {getAuth} from './auth.mjs';
import {getPool} from './db.mjs';
import {ensureSchema} from './schema.mjs';
import {AppError} from './domain.mjs';
export function headers(req){return new Headers(Object.entries(req.headers).flatMap(([k,v])=>v===undefined?[]:[[k,Array.isArray(v)?v.join(','):v]]));}
export function origin(req){return process.env.APP_ORIGIN || `https://${req.headers.host}`;}
export function protectOrigin(req){
  if(req.method==='GET')return;
  if(req.headers['sec-fetch-site']==='cross-site')throw new AppError(403,'Cross-site requests are not allowed.');
  const incoming=req.headers.origin;
  if(incoming && incoming!==origin(req))throw new AppError(403,'Invalid request origin.');
  if(!String(req.headers['content-type']||'').startsWith('application/json'))throw new AppError(415,'A JSON request is required.');
}
export async function body(req,maxBytes=12000){
  if(Number(req.headers['content-length']||0)>maxBytes)throw new AppError(413,'The request is too large.');
  if(req.body!==undefined){let b=req.body;if(typeof b==='string'){try{b=JSON.parse(b)}catch{throw new AppError(400,'Invalid request format.')}}if(Buffer.byteLength(JSON.stringify(b))>maxBytes)throw new AppError(413,'The request is too large.');if(!b||typeof b!=='object'||Array.isArray(b))throw new AppError(400,'Invalid request format.');return b;}
  const chunks=[];let size=0;for await(const chunk of req){const buf=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=buf.length;if(size>maxBytes)throw new AppError(413,'Request is too large.');chunks.push(buf);}
  const raw=Buffer.concat(chunks).toString('utf8');
  try{const result=JSON.parse(raw||'{}');if(!result||typeof result!=='object'||Array.isArray(result))throw Error();return result;}catch{throw new AppError(400,'Invalid request format.');}
}
export function endpoint(methods,handler){return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
  try{
    if(!methods.includes(req.method)){res.setHeader('Allow',methods.join(', '));throw new AppError(405,'This request method is not supported.');}
    protectOrigin(req);await ensureSchema();await handler(req,res);
  }catch(error){
    const status=Number.isInteger(error.status)?error.status:({UNAUTHORIZED:401,FORBIDDEN:403,BAD_REQUEST:400,CONFLICT:409,TOO_MANY_REQUESTS:429}[error.status]||500);
    if(status>=500)console.error('API failure',{type:error.name,code:error.code||'unknown'});
    if(!res.headersSent)res.status(status).json({error:status>=500?'The server could not complete the request. Please try again.':error.message});else res.destroy?.();
  }
};}
export async function actor(req,adminOnly=false){
  const session=await getAuth().api.getSession({headers:headers(req)});
  if(!session)throw new AppError(401,'Please sign in.');
  const {rows}=await getPool().query('SELECT id,username,name,role,status FROM team_members WHERE id=$1',[session.user.id]);
  const member=rows[0];
  if(!member||member.status!=='active')throw new AppError(403,'This account is inactive. Contact your administrator.');
  if(adminOnly&&member.role!=='admin')throw new AppError(403,'Only an administrator can perform this action.');
  return {...member,twoFactorEnabled:!!session.user.twoFactorEnabled};
}
export const digest=value=>createHash('sha256').update(value).digest('hex');
export function secretMatches(value,hash){if(typeof value!=='string'||!hash)return false;const a=Buffer.from(digest(value.trim()));const b=Buffer.from(hash);return a.length===b.length&&timingSafeEqual(a,b);}
export async function rate(req,scope,max=10,seconds=900,identity=''){
  const ip=req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown';
  const key=createHmac('sha256',process.env.BETTER_AUTH_SECRET).update(`${scope}:${identity||String(ip).split(',')[0]}`).digest('hex');
  const {rows}=await getPool().query(`INSERT INTO request_limits(key,hits,expires_at) VALUES($1,1,now()+$2*interval '1 second')
  ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN request_limits.expires_at<now() THEN 1 ELSE request_limits.hits+1 END,
  expires_at=CASE WHEN request_limits.expires_at<now() THEN EXCLUDED.expires_at ELSE request_limits.expires_at END RETURNING hits`,[key,seconds]);
  if(rows[0].hits>max)throw new AppError(429,'Too many attempts. Please try again later.');
}
export function sendAuthResponse(res,response){
  const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);
  res.status(response.status);return response.text().then(t=>{res.setHeader('Content-Type','application/json');res.end(t)});
}
