import {endpoint,actor,body,rate} from '../server/http.mjs';
import {getPool,transaction} from '../server/db.mjs';
import {AppError,uuid} from '../server/domain.mjs';
import {parseProduct,LANDING_PRODUCT_ID} from '../server/products.mjs';
export default endpoint(['GET','POST','PATCH'],async(req,res)=>{
  const user=await actor(req,true);
  if(req.method==='GET'){
    const u=new URL(req.url,'https://local'),page=Number(u.searchParams.get('page')||1);
    if(!Number.isInteger(page)||page<1||page>100000)throw new AppError(400,'Invalid page.');
    const q=(u.searchParams.get('q')||'').trim().slice(0,100).replace(/[\\%_]/g,'\\$&');
    const values=['%'+q+'%'];
    const [list,count]=await Promise.all([
      getPool().query('SELECT * FROM shop_products WHERE name ILIKE $1 OR sku ILIKE $1 ORDER BY created_at DESC,id LIMIT 30 OFFSET $2',[...values,(page-1)*30]),
      getPool().query('SELECT count(*)::int AS total FROM shop_products WHERE name ILIKE $1 OR sku ILIKE $1',values)
    ]);
    return res.json({products:list.rows,total:count.rows[0].total,page,pageSize:30,landingProductId:LANDING_PRODUCT_ID});
  }
  await rate(req,'product-write',120,3600,user.id);
  const data=await body(req),input=parseProduct(data);
  let result;
  try{result=await transaction(async c=>{
    let prior,product;
    if(req.method==='PATCH'){
      const id=uuid(data.id);
      prior=(await c.query('SELECT * FROM shop_products WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(!prior)throw new AppError(404,'Product not found.');
      if(!Number.isInteger(data.version)||data.version!==prior.version)throw new AppError(409,'Product or stock changed. Refresh and reopen before saving.');
      product=(await c.query(`UPDATE shop_products SET sku=$2,name=$3,description=$4,image_url=$5,price=$6,compare_at_price=$7,stock=$8,active=$9,version=version+1,updated_at=now() WHERE id=$1 RETURNING *`,[id,input.sku,input.name,input.description,input.image_url,input.price,input.compare_at_price,input.stock,input.active])).rows[0];
    }else{
      product=(await c.query(`INSERT INTO shop_products(sku,name,description,image_url,price,compare_at_price,stock,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[input.sku,input.name,input.description,input.image_url,input.price,input.compare_at_price,input.stock,input.active])).rows[0];
    }
    await c.query('INSERT INTO product_events(product_id,actor_id,kind,details) VALUES($1,$2,$3,$4)',[product.id,user.id,prior?'updated':'created',JSON.stringify({before:prior||null,after:product})]);
    return product;
  });}catch(e){if(e.code==='23505')throw new AppError(409,'This SKU already exists. Use a unique SKU.');throw e;}
  res.status(req.method==='POST'?201:200).json({product:result});
});
