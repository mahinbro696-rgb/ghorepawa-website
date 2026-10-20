// Literal, parameterized partial matching. Scope/role restrictions remain in orders.js.
const BENGALI_DIGITS='\u09e6\u09e7\u09e8\u09e9\u09ea\u09eb\u09ec\u09ed\u09ee\u09ef';
export function searchTerms(value){
 let q=String(value??'').normalize('NFKC').replace(/[\u09e6-\u09ef]/g,c=>String(BENGALI_DIGITS.indexOf(c)))
  .trim().replace(/\s+/g,' ').slice(0,100);
 if(/^es[\s\-\u2010-\u2015]*\d+$/i.test(q))q='ES-'+q.replace(/^es[\s\-\u2010-\u2015]*/i,'').replace(/^0+(?=\d)/,'');
 // Accept pasted/formatted Bangladesh phones, including +880 and Bengali digits.
 else if(/^[+\d\s().-]+$/.test(q)){
  const digits=q.replace(/\D/g,'');
  if(digits.length>=3)q=/^8801\d{9}$/.test(digits)?digits.slice(2):digits;
 }
 return [...new Set(q.split(/\s+/).filter(Boolean))];
}
const escapeLike=value=>value.replace(/[!%_]/g,'!$&');
export function appendOrderSearch(value,params,where){
 const terms=searchTerms(value);
 for(const term of terms){
  params.push('%'+escapeLike(term)+'%');const bind='$'+params.length;
  const fields=['o.customer_name','o.phone','o.address','o.area','o.district','o.product_name',"('ES-'||o.reference::text)"];
  // translate also matches house/street numbers entered in Bengali on checkout.
  where.push('('+fields.map(field=>`translate(normalize(COALESCE(${field},''),NFKC),'${BENGALI_DIGITS}','0123456789') ILIKE ${bind} ESCAPE '!'`).join(' OR ')+')');
 }
 return terms;
}
