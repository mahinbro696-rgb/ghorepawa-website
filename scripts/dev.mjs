import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.png':'image/png','.webp':'image/webp'};
http.createServer(async(req,res)=>{
 res.status=n=>{res.statusCode=n;return res};res.json=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
 try{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname.startsWith('/api/')){const name=pathname.slice(5);if(!/^[a-z]+$/.test(name)){res.status(404).end();return;}const module=await import(`../api/${name}.js`);await module.default(req,res);return;}
 const relative=pathname==='/'?'index.html':pathname==='/admin'||pathname==='/admin/'||pathname==='/admin/setup'?'admin/index.html':pathname.slice(1);
 const file=path.resolve('public',relative);if(!file.startsWith(path.resolve('public')+path.sep)){res.status(403).end();return;}await stat(file);res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));
 }catch{res.status(404).json({error:'Not found'});}
}).listen(process.env.PORT||3000,()=>console.log('Local site: http://localhost:'+(process.env.PORT||3000)));
