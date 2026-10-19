import {betterAuth} from 'better-auth';
import {admin} from 'better-auth/plugins/admin';
import {twoFactor} from 'better-auth/plugins/two-factor';
import {createAuthMiddleware,APIError} from 'better-auth/api';
import {getPool} from './db.mjs';
let instance;
export function getAuth() {
  if (!process.env.BETTER_AUTH_SECRET) throw new Error('Authentication secret is not configured');
  return instance ||= betterAuth({
    appName:'Ever Strong Team',
    baseURL:process.env.APP_ORIGIN || ((process.env.VERCEL_ENV==='preview'?process.env.VERCEL_URL:process.env.VERCEL_PROJECT_PRODUCTION_URL) ? `https://${process.env.VERCEL_ENV==='preview'?process.env.VERCEL_URL:process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000'),
    basePath:'/api/auth',
    trustedOrigins:[process.env.APP_ORIGIN,...[process.env.VERCEL_URL,process.env.VERCEL_BRANCH_URL,process.env.VERCEL_PROJECT_PRODUCTION_URL].filter(Boolean).map(host=>'https://'+host)].filter(Boolean),
    secret:process.env.BETTER_AUTH_SECRET,
    database:getPool(),
    user:{modelName:'team_auth_users'},
    session:{modelName:'team_auth_sessions',expiresIn:60*60*12,updateAge:60*30,cookieCache:{enabled:false}},
    account:{modelName:'team_auth_accounts'},
    verification:{modelName:'team_auth_verifications'},
    emailAndPassword:{enabled:true,minPasswordLength:12,maxPasswordLength:128,autoSignIn:false},
    rateLimit:{enabled:true,storage:'database',window:60,max:30,modelName:'team_auth_rate_limits'},
    plugins:[admin(),twoFactor({issuer:'Ever Strong',twoFactorTable:'team_auth_two_factor'})],
    hooks:{before:createAuthMiddleware(async ctx=>{
      if(ctx.path==='/sign-up/email' && ctx.headers?.get('x-internal-provision') !== process.env.BETTER_AUTH_SECRET) throw new APIError('FORBIDDEN',{message:'অ্যাকাউন্ট শুধু অ্যাডমিন তৈরি করতে পারবেন।'});
    })},
    advanced:{useSecureCookies:!!process.env.VERCEL||process.env.NODE_ENV==='production',database:{validateSchema:false}},
    logger:{level:'error'}
  });
}
export function staffEmail(id){return `${id}@staff.ghorepawa.internal`;}
export async function provisionUser({name,username,password}) {
  return getAuth().api.signUpEmail({body:{name,email:staffEmail(username),password},headers:new Headers({'x-internal-provision':process.env.BETTER_AUTH_SECRET})});
}
