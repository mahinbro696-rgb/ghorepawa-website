import test from 'node:test';
import assert from 'node:assert/strict';
import {parseProduct} from '../server/products.mjs';
import {decodeProductImage} from '../server/images.mjs';
const valid={name:'Sample product',sku:'TEST-01',price:499,compare_at_price:599,stock:3,active:true,description:'Sample only',image_url:'/assets/sample.webp'};
test('product validation normalizes a valid product',()=>{assert.equal(parseProduct({...valid,sku:'test-01'}).sku,'TEST-01');assert.equal(parseProduct({...valid,stock:''}).stock,null);});
for(const [name,change] of Object.entries({negativePrice:{price:-1},fractionalPrice:{price:4.5},lowPreviousPrice:{compare_at_price:20},negativeStock:{stock:-1},decimalStock:{stock:1.5},badActive:{active:'false'},badSku:{sku:'A B'},scriptURL:{image_url:'javascript:alert(1)'},dataURL:{image_url:'data:image/svg+xml,x'},localTraversal:{image_url:'/assets/../server/secret.png'},credentials:{image_url:'https://user:pass@example.test/x.png'},oversizedDescription:{description:'x'.repeat(3001)}}))test('reject product '+name,()=>assert.throws(()=>parseProduct({...valid,...change})));
test('image validation rejects script formats, fake bytes and oversized input',()=>{
 for(const value of ['data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,aGVsbG8=', 'data:image/png;base64,'+'A'.repeat(2800001)])assert.throws(()=>decodeProductImage(value));
});
