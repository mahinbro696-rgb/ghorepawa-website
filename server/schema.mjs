import {getMigrations} from 'better-auth/db/migration';
import {getAuth} from './auth.mjs';
import {transaction} from './db.mjs';
import {upgradeSchema} from './upgrade.mjs';
import {upgradePortal} from './products.mjs';
import {bootstrapOwner} from './bootstrap.mjs';
let ready;
export function ensureSchema(){
  return ready ||= (async()=>{
    await transaction(async client=>{
    await client.query("SELECT pg_advisory_xact_lock(823709415)");
    await client.query('CREATE TABLE IF NOT EXISTS shop_schema (version integer PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now())');
    if((await client.query('SELECT version FROM shop_schema WHERE version=1')).rows.length)return;
    const {runMigrations}=await getMigrations(getAuth().options);
    await runMigrations();
    await client.query(`CREATE TABLE IF NOT EXISTS team_members (
      id text PRIMARY KEY REFERENCES team_auth_users(id) ON DELETE CASCADE,
      username text UNIQUE NOT NULL, name text NOT NULL,
      role text NOT NULL CHECK(role IN ('admin','moderator')),
      status text NOT NULL CHECK(status IN ('pending','active','disabled')),
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query("CREATE UNIQUE INDEX IF NOT EXISTS single_team_admin ON team_members(role) WHERE role='admin'");
    await client.query(`CREATE TABLE IF NOT EXISTS shop_orders (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reference bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
      request_key uuid UNIQUE NOT NULL, fingerprint text NOT NULL,
      customer_name text NOT NULL, phone text NOT NULL,district text NOT NULL,area text NOT NULL,address text NOT NULL,
      quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 10), unit_price integer NOT NULL DEFAULT 399 CHECK(unit_price>0),
      total integer NOT NULL CHECK(total=quantity*unit_price),
      status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','assigned','callback','confirmed','approved','unapproved','dispatched','delivered','cancelled')),
      assigned_to text REFERENCES team_members(id), assigned_at timestamptz, callback_at timestamptz,
      latest_note text NOT NULL DEFAULT '', version integer NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query('CREATE INDEX IF NOT EXISTS shop_orders_queue ON shop_orders(status,created_at DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS shop_orders_assignee ON shop_orders(assigned_to,status,created_at DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS shop_orders_phone ON shop_orders(phone)');
    await client.query(`CREATE TABLE IF NOT EXISTS order_events (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, order_id uuid NOT NULL REFERENCES shop_orders(id) ON DELETE CASCADE,
      actor_id text REFERENCES team_members(id), kind text NOT NULL, from_status text, to_status text, note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query('CREATE INDEX IF NOT EXISTS order_events_order ON order_events(order_id,id)');
    await client.query(`CREATE TABLE IF NOT EXISTS team_events (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,actor_id text REFERENCES team_members(id),target_id text REFERENCES team_members(id),kind text NOT NULL,created_at timestamptz NOT NULL DEFAULT now())`);
    await client.query(`CREATE TABLE IF NOT EXISTS request_limits (key text PRIMARY KEY,hits integer NOT NULL,expires_at timestamptz NOT NULL)`);
    await client.query('INSERT INTO shop_schema(version) VALUES(1)');
    });
    await upgradeSchema();
    await upgradePortal();
    await bootstrapOwner();
  })().catch(error=>{ready=null;throw error;});
}
