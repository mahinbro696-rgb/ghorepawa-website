// Local-only real API test server with ephemeral PGlite data; never uses Neon.
import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mock} from 'node:test';
import {randomBytes} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {hashPassword} from 'better-auth/crypto';
if(process.env.GHOREPAWA_TEST_ONLY!=='1')throw Error('Explicit test opt-in is required');
delete process.env.DATABASE_URL;delete process.env.VERCEL;delete process.env.VERCEL_ENV;
const db=new PGlite();const pool={query:(q,a)=>db.query(q,a),connect:async()=>({query:(q,a)=>db.query(q,a),release(){}})};
mock.module('../../server/db.mjs',{namedExports:{getPool:()=>pool,transaction:async f=>{await db.query('BEGIN');try{const x=await f(pool);await db.query('COMMIT');return x;}catch(e){await db.query('ROLLBACK');throw e;}}}});
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../public');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp'};
let queue=Promise.resolve();
const server=http.createServer((req,res)=>{
 const route=new URL(req.url,'http://localhost').pathname;
 res.status=function(n){res.statusCode=n;return this;};res.json=x=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(x));};
 const run=async()=>{
  try{
   if(route.startsWith('/api/')){const name=route.slice(5);if(!/^[a-z]+$/.test(name)){res.status(404).end();return;}return await (await import('../../api/'+name+'.js')).default(req,res);}
   const rel=['/admin','/moderator'].includes(route)?'admin/index.html':route==='/shop'?'shop/index.html':route==='/'?'index.html':route.slice(1);
   const file=path.resolve(root,rel);if(!file.startsWith(root+path.sep)||!(await stat(file)).isFile())throw Error();
   res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));
  }catch{if(!res.headersSent)res.status(404).end();else res.destroy();}
 };
 // Serial in-memory test DB adapter, not a production capacity/concurrency model.
 if(route.startsWith('/api/'))queue=queue.then(run,run);else run();
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
process.env.NODE_ENV='test';process.env.APP_ORIGIN='http://127.0.0.1:'+server.address().port;
process.env.BETTER_AUTH_SECRET=randomBytes(40).toString('hex');
const password=randomBytes(20).toString('base64url');process.env.ADMIN_INITIAL_PASSWORD_HASH=await hashPassword(password);
await (await import('../../server/schema.mjs')).ensureSchema();
// The harness reads this once; it is never printed into the CI log or uploaded.
console.log(JSON.stringify({origin:process.env.APP_ORIGIN,password}));
async function end(){server.closeAllConnections();server.close();await db.close();process.exit(0);}
process.on('SIGTERM',end);process.on('SIGINT',end);
