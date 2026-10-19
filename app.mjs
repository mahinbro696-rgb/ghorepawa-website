import http from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2'};
const apiNames=new Set(['auth','export','history','login','orders','security','session','setup','team']);
const port=Number(process.env.PORT||3000);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid PORT');
if(!process.env.DATABASE_URL||!process.env.BETTER_AUTH_SECRET||!process.env.APP_ORIGIN){
  throw Error('DATABASE_URL, BETTER_AUTH_SECRET and APP_ORIGIN must be configured');
}
const origin=new URL(process.env.APP_ORIGIN);
if(origin.protocol!=='https:'||origin.pathname!=='/'||origin.search||origin.hash)throw Error('APP_ORIGIN must be an HTTPS origin without a path');
const server=http.createServer(async(req,res)=>{
  res.status=function(code){this.statusCode=code;return this;};
  res.json=function(value){this.setHeader('Content-Type','application/json; charset=utf-8');this.end(JSON.stringify(value));return this;};
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  try{
    const rawPath=new URL(req.url,'http://localhost').pathname;
    if(rawPath.startsWith('/api/')){
      res.setHeader('Cache-Control','private, no-store');
      const name=rawPath.slice(5);
      if(!apiNames.has(name))return res.status(404).json({error:'Not found'});
      // Keep original host for cookie/auth origin checks; cPanel reverse proxy supplies it.
      const handler=(await import('./api/'+name+'.js')).default;
      return await handler(req,res);
    }
    if(req.method!=='GET'&&req.method!=='HEAD'){
      res.setHeader('Allow','GET, HEAD');return res.status(405).end();
    }
    let relative=rawPath==='/'?'index.html':
      ['/admin','/admin/','/admin/setup','/moderator','/moderator/'].includes(rawPath)?'admin/index.html':rawPath.slice(1);
    // Do not expose dotfiles or application source; only the public directory is served.
    if(relative.split('/').some(part=>!part||part.startsWith('.')))return res.status(404).end();
    const candidate=path.resolve(root,relative);
    if(!candidate.startsWith(root+path.sep))return res.status(404).end();
    const info=await stat(candidate);
    if(!info.isFile())return res.status(404).end();
    if(relative.startsWith('admin/')){
      res.setHeader('Cache-Control','private, no-store');
      res.setHeader('X-Frame-Options','DENY');
      res.setHeader('X-Robots-Tag','noindex, nofollow');
    }
    res.setHeader('Content-Type',mime[path.extname(candidate).toLowerCase()]||'application/octet-stream');
    if(req.method==='HEAD')return res.end();
    return res.end(await readFile(candidate));
  }catch(err){
    if(err?.code==='ENOENT'||err?.code==='EISDIR')return res.status(404).end();
    console.error('Request failure',err?.name||'Error');
    if(!res.headersSent)return res.status(500).json({error:'Internal server error'});
    res.destroy();
  }
});
server.listen(port,()=>console.log('Ghorepawa production server listening on port '+port));
