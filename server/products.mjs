import {transaction} from './db.mjs';
import {AppError,text} from './domain.mjs';
export const LANDING_PRODUCT_ID='00000000-0000-4000-8000-000000000001';
export function parseProduct(data){
  const name=text(data.name,'Product name',2,120);
  const sku=text(data.sku,'SKU',2,50).toUpperCase();
  if(!/^[A-Z0-9][A-Z0-9_-]+$/.test(sku))throw new AppError(400,'SKU: use letters, numbers, - or _.');
  const price=Number(data.price),compare=Number(data.compare_at_price||0);
  if(!Number.isSafeInteger(price)||price<1||price>1000000)throw new AppError(400,'Price must be a whole taka amount from 1 to 1000000.');
  if(!Number.isSafeInteger(compare)||compare<0||compare>1000000||(compare>0&&compare<price))throw new AppError(400,'Previous price must be zero or at least the current price.');
  const stock=data.stock===null||data.stock===''?null:Number(data.stock);
  if(stock!==null&&(!Number.isSafeInteger(stock)||stock<0||stock>1000000))throw new AppError(400,'Stock must be a non-negative whole number, or blank for unlimited.');
  if(typeof data.active!=='boolean')throw new AppError(400,'Active must be true or false.');
  const description=text(data.description||'','Description',0,3000);
  const image=text(data.image_url||'','Image URL',0,1500);
  if(image){
    if(image.startsWith('/assets/')||image.startsWith('/uploads/products/')){
      if(!/^\/(?:assets|uploads\/products)\/[A-Za-z0-9_./-]+\.(?:png|jpe?g|webp|gif)$/i.test(image)||image.includes('..'))throw new AppError(400,'Use a valid public image path.');
    }else{let url;try{url=new URL(image);}catch{throw new AppError(400,'Use an HTTPS image URL.');}
      if(url.protocol!=='https:'||url.username||url.password)throw new AppError(400,'Use an HTTPS image URL without credentials.');}
  }
  return {name,sku,price,compare_at_price:compare,stock,active:data.active,description,image_url:image};
}
// Additive, versioned migration. No customer/order/authentication records are deleted.
export async function upgradePortal(){
  await transaction(async c=>{
    await c.query('SELECT pg_advisory_xact_lock(823709415)');
    if((await c.query('SELECT version FROM shop_schema WHERE version=3')).rows.length)return;
    await c.query(`CREATE TABLE IF NOT EXISTS shop_products(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),sku text UNIQUE NOT NULL,name text NOT NULL,
      description text NOT NULL DEFAULT '',image_url text NOT NULL DEFAULT '',
      price integer NOT NULL CHECK(price BETWEEN 1 AND 1000000),compare_at_price integer NOT NULL DEFAULT 0 CHECK(compare_at_price=0 OR compare_at_price>=price),
      stock integer CHECK(stock>=0),active boolean NOT NULL DEFAULT false,
      version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await c.query(`INSERT INTO shop_products(id,sku,name,price,compare_at_price,image_url,active)
      VALUES($1,'EVER-STRONG','Ever Strong',399,2599,'/assets/ever-strong.png',true) ON CONFLICT(id) DO NOTHING`,[LANDING_PRODUCT_ID]);
    await c.query("ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES shop_products(id)");
    await c.query("ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS product_name text NOT NULL DEFAULT 'Ever Strong'");
    await c.query('ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS stock_reserved boolean NOT NULL DEFAULT false');
    await c.query(`CREATE TABLE IF NOT EXISTS product_events(
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,product_id uuid NOT NULL REFERENCES shop_products(id),
      actor_id text REFERENCES team_members(id),kind text NOT NULL,details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await c.query(`CREATE TABLE IF NOT EXISTS portal_notice_state(
      user_id text PRIMARY KEY REFERENCES team_members(id),read_through bigint NOT NULL DEFAULT 0,updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await c.query('CREATE INDEX IF NOT EXISTS shop_products_public ON shop_products(active,created_at DESC,id)');
    await c.query('CREATE INDEX IF NOT EXISTS shop_orders_created ON shop_orders(created_at DESC,id)');
    await c.query('CREATE INDEX IF NOT EXISTS shop_orders_callback ON shop_orders(assigned_to,callback_at) WHERE status=\'callback\'');
    await c.query('CREATE INDEX IF NOT EXISTS shop_orders_product ON shop_orders(product_id)');
    await c.query('CREATE INDEX IF NOT EXISTS product_events_product ON product_events(product_id,id DESC)');
    await c.query(`CREATE OR REPLACE FUNCTION preserve_order_product() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF ROW(OLD.product_id,OLD.product_name) IS DISTINCT FROM ROW(NEW.product_id,NEW.product_name) THEN RAISE EXCEPTION 'Order product snapshot is immutable'; END IF;
      RETURN NEW; END $$`);
    await c.query('CREATE TRIGGER preserve_order_product BEFORE UPDATE ON shop_orders FOR EACH ROW EXECUTE FUNCTION preserve_order_product()');
    await c.query('CREATE TRIGGER preserve_shop_products BEFORE DELETE OR TRUNCATE ON shop_products FOR EACH STATEMENT EXECUTE FUNCTION prevent_business_data_deletion()');
    await c.query('CREATE TRIGGER preserve_product_events BEFORE DELETE OR TRUNCATE ON product_events FOR EACH STATEMENT EXECUTE FUNCTION prevent_business_data_deletion()');
    await c.query('CREATE TRIGGER immutable_product_events BEFORE UPDATE ON product_events FOR EACH STATEMENT EXECUTE FUNCTION prevent_audit_mutation()');
    await c.query('INSERT INTO shop_schema(version) VALUES(3)');
  });
}
