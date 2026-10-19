import {readdirSync,readFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
for(const file of ['app.mjs',...['api','server','scripts','public/admin','public/assets','tests'].flatMap(walk)].filter(f=>/\.(mjs|js)$/.test(f))){const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(r.status){console.error(r.stderr);process.exit(1);}}
for(const file of ['public/index.html','public/admin/index.html']){const content=readFileSync(file,'utf8');const ids=[...content.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);if(ids.length!==new Set(ids).size)throw Error('Duplicate IDs: '+file);for(const match of content.matchAll(/(?:src|href)="((?:assets\/|\/admin\/)[^"?#]+)(?:[?#][^"]*)?"/g)){const local='public/'+match[1].replace(/^\//,'');if(!existsSync(local))throw Error('Missing asset: '+local);}}
console.log('JavaScript syntax, HTML IDs and local asset references passed.');
