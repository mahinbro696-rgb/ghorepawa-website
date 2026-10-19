import {endpoint} from '../server/http.mjs';
import {getPool} from '../server/db.mjs';
import {AppError,uuid} from '../server/domain.mjs';
import {LANDING_PRODUCT_ID} from '../server/products.mjs';
export default endpoint(['GET'],async(req,res)=>{
  const u=new URL(req.url,'https://local'),id=u.searchParams.get('id');
  const page=Number(u.searchParams.get('page')||1);
  if(!Number.isInteger(page)||page<1||page>100000)throw new AppError(400,'Invalid page.');
  const fields='id,sku,name,description,image_url,price,compare_at_price,stock,version';
  const params=id?[uuid(id)]:[(page-1)*24];
  const {rows}=await getPool().query(id?`SELECT ${fields} FROM shop_products WHERE active=true AND id=$1`:`SELECT ${fields} FROM shop_products WHERE active=true ORDER BY created_at DESC,id LIMIT 25 OFFSET $1`,params);
  res.json({products:rows.slice(0,24),hasMore:rows.length>24,page,landingProductId:LANDING_PRODUCT_ID});
});
