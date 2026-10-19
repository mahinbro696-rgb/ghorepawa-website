import {cp, mkdir, rm} from 'node:fs/promises';
await rm('dist', {recursive:true, force:true});
await mkdir('dist', {recursive:true});
await cp('public', 'dist', {recursive:true});
console.log('Storefront and admin assets built. Server APIs are deployed separately by Vercel.');
