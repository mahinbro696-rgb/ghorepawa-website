import test from 'node:test';
import assert from 'node:assert/strict';
import {body,protectOrigin,secretMatches,digest} from '../server/http.mjs';
test('mutation requests reject cross-site origins and non-JSON forms',()=>{
 const req={method:'POST',headers:{host:'shop.example','content-type':'application/json',origin:'https://shop.example'}};
 assert.doesNotThrow(()=>protectOrigin(req));
 assert.throws(()=>protectOrigin({...req,headers:{...req.headers,origin:'https://attacker.example'}}));
 assert.throws(()=>protectOrigin({...req,headers:{...req.headers,'sec-fetch-site':'cross-site'}}));
 assert.throws(()=>protectOrigin({...req,headers:{...req.headers,'content-type':'application/x-www-form-urlencoded'}}));
});
test('body parser rejects arrays, malformed JSON and oversized payloads',async()=>{
 for(const data of ['{',null,[],{name:'x'.repeat(12001)}])await assert.rejects(()=>body({headers:{},body:data}));
 assert.deepEqual(await body({headers:{},body:'{"quantity":2}'}),{quantity:2});
});
test('owner setup secret is compared by its hash and fails closed',()=>{
 const token='temporary-test-secret';assert(secretMatches(token,digest(token)));assert(!secretMatches('wrong',digest(token)));assert(!secretMatches(token,''));assert(!secretMatches(null,digest(token)));
});
test('all API modules import without connecting to a database at build time',async()=>{
 for(const name of ['auth','setup','login','session','team','orders','history']){
 const module=await import('../api/'+name+'.js');assert.equal(typeof module.default,'function');
 }
});
