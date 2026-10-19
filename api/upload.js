import {endpoint,actor,body,rate} from '../server/http.mjs';
import {decodeProductImage} from '../server/images.mjs';
import {AppError} from '../server/domain.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export default endpoint(['POST'],async(req,res)=>{
 const user=await actor(req,true);await rate(req,'product-upload',30,3600,user.id);
 if(process.env.VERCEL)throw new AppError(503,'Direct uploads require the ExonHost server. In a Vercel preview, enter an HTTPS image URL instead.');
 const data=await body(req,3*1024*1024),{buffer,extension}=decodeProductImage(data.image);
 const root=process.env.NODE_ENV==='test'&&process.env.PORTAL_TEST_UPLOAD_DIR?process.env.PORTAL_TEST_UPLOAD_DIR:fileURLToPath(new URL('../public/uploads/products/',import.meta.url));
 const name=randomUUID()+'.'+extension;
 await mkdir(root,{recursive:true,mode:0o755});await writeFile(path.join(root,name),buffer,{flag:'wx',mode:0o644});
 res.status(201).json({url:'/uploads/products/'+name});
});
