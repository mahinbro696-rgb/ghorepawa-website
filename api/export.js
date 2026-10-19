import {endpoint,actor} from '../server/http.mjs';
import {transaction} from '../server/db.mjs';
export default endpoint(['GET'],async(req,res)=>{
 await actor(req,true);
 // A consistent snapshot, delivered as a streaming JSON document: no pagination gaps
 // and no response-size-dependent in-memory array of all customer information.
 await transaction(async client=>{
  await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Content-Disposition',`attachment; filename="ever-strong-backup-${new Date().toISOString().slice(0,10)}.json"`);
  res.write('{"formatVersion":2,"exportedAt":'+JSON.stringify(new Date().toISOString()));
  for(const table of ['shop_orders','order_events','team_members','team_events','shop_products','product_events','moderator_work_history','order_erasure_audit']){
   res.write(','+JSON.stringify(table)+':[');
   await client.query(`DECLARE export_rows NO SCROLL CURSOR FOR SELECT * FROM ${table} ORDER BY id`);
   let first=true;
   while(true){const {rows}=await client.query('FETCH FORWARD 500 FROM export_rows');if(!rows.length)break;for(const row of rows){res.write((first?'':',')+JSON.stringify(row));first=false;}}
   await client.query('CLOSE export_rows');res.write(']');
  }
  res.write('}');
 });res.end();
});
