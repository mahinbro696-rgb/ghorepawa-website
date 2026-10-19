import {getMigrations} from 'better-auth/db/migration';
import {getAuth} from './auth.mjs';
import {transaction} from './db.mjs';
export async function upgradeSchema(){
 return transaction(async client=>{
  await client.query('SELECT pg_advisory_xact_lock(823709415)');
  if((await client.query('SELECT version FROM shop_schema WHERE version=2')).rows.length)return;
  const {runMigrations}=await getMigrations(getAuth().options);
  await runMigrations();
  await client.query(`CREATE OR REPLACE FUNCTION prevent_business_data_deletion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Business records cannot be deleted'; END $$`);
  for(const table of ['shop_orders','order_events','team_members','team_events']){
   await client.query(`CREATE TRIGGER preserve_${table} BEFORE DELETE OR TRUNCATE ON ${table} FOR EACH STATEMENT EXECUTE FUNCTION prevent_business_data_deletion()`);
  }
  await client.query(`CREATE OR REPLACE FUNCTION prevent_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Audit history is immutable'; END $$`);
  for(const table of ['order_events','team_events'])await client.query(`CREATE TRIGGER immutable_${table} BEFORE UPDATE ON ${table} FOR EACH STATEMENT EXECUTE FUNCTION prevent_audit_mutation()`);
  await client.query(`CREATE OR REPLACE FUNCTION preserve_order_details() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
   IF ROW(OLD.id,OLD.reference,OLD.request_key,OLD.fingerprint,OLD.customer_name,OLD.phone,OLD.district,OLD.area,OLD.address,OLD.quantity,OLD.unit_price,OLD.total,OLD.created_at) IS DISTINCT FROM ROW(NEW.id,NEW.reference,NEW.request_key,NEW.fingerprint,NEW.customer_name,NEW.phone,NEW.district,NEW.area,NEW.address,NEW.quantity,NEW.unit_price,NEW.total,NEW.created_at) THEN RAISE EXCEPTION 'Original order details are immutable'; END IF;
   RETURN NEW; END $$`);
  await client.query('CREATE TRIGGER preserve_order_details BEFORE UPDATE ON shop_orders FOR EACH ROW EXECUTE FUNCTION preserve_order_details()');
  await client.query('INSERT INTO shop_schema(version) VALUES(2)');
 });
}
