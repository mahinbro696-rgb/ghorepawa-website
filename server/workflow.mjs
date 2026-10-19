import {transaction} from './db.mjs';
import {AppError} from './domain.mjs';
import {createHash} from 'node:crypto';

export const ACTIVE_WORK = ['assigned', 'callback'];
export const WORK_RESULTS = ['confirmed', 'callback', 'cancelled', 'unapproved'];
export const erasedKey = key => createHash('sha256').update(key).digest('hex');
export const canWork = (order, member) => member.role === 'moderator'
  && order.assigned_to === member.id && ACTIVE_WORK.includes(order.status);
export const lockRequest = (client, key) => client.query(
  'SELECT pg_advisory_xact_lock(hashtextextended($1, 823709417))', [key]);

// Version 4 changes the retention policy only for an explicitly confirmed,
// admin-scoped single-order erasure. It does not erase any orders on migration.
export async function upgradeWorkflow() {
  await transaction(async c => {
    await c.query('SELECT pg_advisory_xact_lock(823709415)');
    if ((await c.query('SELECT version FROM shop_schema WHERE version=4')).rows.length) return;
    await c.query('ALTER TABLE team_members ADD COLUMN badge_number bigint GENERATED ALWAYS AS IDENTITY');
    await c.query('CREATE UNIQUE INDEX team_badge_number ON team_members(badge_number)');
    await c.query('ALTER TABLE shop_orders ADD COLUMN assignment_round integer NOT NULL DEFAULT 0');
    await c.query('ALTER TABLE shop_orders ADD COLUMN callback_customer boolean NOT NULL DEFAULT false');
    await c.query('ALTER TABLE shop_orders ADD COLUMN confirmed_by text REFERENCES team_members(id)');
    await c.query(`CREATE TABLE moderator_work_history (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      order_id uuid NOT NULL REFERENCES shop_orders(id) ON DELETE CASCADE,
      moderator_id text NOT NULL REFERENCES team_members(id),
      assignment_round integer NOT NULL,
      outcome text NOT NULL CHECK(outcome IN('confirmed','callback','cancelled','unapproved')),
      submitted_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(order_id, moderator_id, assignment_round)
    )`);
    // A one-way hash of a random request UUID contains no customer, order ID,
    // address, phone or reference. It prevents an old retry recreating an erased order.
    await c.query(`CREATE TABLE order_request_tombstones (
      request_digest text PRIMARY KEY CHECK(length(request_digest)=64),
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await c.query(`CREATE TABLE order_erasure_audit (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      actor_id text NOT NULL REFERENCES team_members(id),
      erased_at timestamptz NOT NULL DEFAULT now()
    )`);
    await c.query('CREATE INDEX work_history_member ON moderator_work_history(moderator_id,id DESC)');
    await c.query('CREATE INDEX orders_confirmed_by ON shop_orders(confirmed_by,status)');
    await c.query(`CREATE INDEX orders_inbox ON shop_orders(assigned_to,assigned_at DESC,id)
      WHERE status IN('assigned','callback')`);
    await c.query(`UPDATE shop_orders o SET callback_customer=true
      WHERE status='callback' OR EXISTS(SELECT 1 FROM order_events e WHERE e.order_id=o.id AND e.to_status='callback')`);
    await c.query(`UPDATE shop_orders o SET confirmed_by=(
      SELECT e.actor_id FROM order_events e JOIN team_members m ON m.id=e.actor_id
      WHERE e.order_id=o.id AND e.to_status='confirmed' AND e.kind='status' AND m.role='moderator'
      ORDER BY e.id DESC LIMIT 1)`);
    // Preserve the most recent v2 moderator submission as a minimal receipt.
    // Never attribute an admin's cancellation or note to a moderator.
    await c.query(`INSERT INTO moderator_work_history(order_id,moderator_id,assignment_round,outcome,submitted_at)
      SELECT o.id,e.actor_id,0,e.to_status,e.created_at FROM shop_orders o
      JOIN LATERAL (SELECT e.* FROM order_events e JOIN team_members m ON m.id=e.actor_id
        WHERE e.order_id=o.id AND e.kind='status' AND m.role='moderator'
        AND e.to_status IN('confirmed','callback','cancelled','unapproved')
        ORDER BY e.id DESC LIMIT 1) e ON true
      ON CONFLICT DO NOTHING`);
    // Finished work returns to admin; an untouched callback reassigned more recently stays active.
    await c.query(`UPDATE shop_orders o SET assigned_to=NULL,assigned_at=NULL
      WHERE assigned_to IS NOT NULL AND (status NOT IN('assigned','callback')
        OR (status='callback' AND EXISTS(SELECT 1 FROM moderator_work_history h
          WHERE h.order_id=o.id AND h.moderator_id=o.assigned_to
            AND h.outcome='callback' AND h.submitted_at>=COALESCE(o.assigned_at,'epoch'::timestamptz))))`);
    await c.query('UPDATE shop_orders SET assignment_round=1 WHERE assigned_to IS NOT NULL');
    await c.query(`CREATE OR REPLACE FUNCTION permit_scoped_order_erasure() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE target text; requested text; admin_id text;
    BEGIN
      requested := current_setting('ghorepawa.erase_order', true);
      admin_id := current_setting('ghorepawa.erase_actor', true);
      IF TG_TABLE_NAME='shop_orders' THEN target:=OLD.id::text;
      ELSIF TG_TABLE_NAME='product_events' THEN target:=OLD.details->>'orderId';
      ELSE target:=OLD.order_id::text; END IF;
      IF requested IS NULL OR requested='' OR target IS NULL OR target<>requested
        OR NOT EXISTS(SELECT 1 FROM team_members WHERE id=admin_id AND role='admin' AND status='active') THEN
        RAISE EXCEPTION 'Single-order admin erasure authorization required';
      END IF;
      RETURN OLD;
    END $$`);
    // Retain unconditional TRUNCATE protection, all audit UPDATE protection and
    // all team/product deletion protection. Only row-bound order erasure is permitted.
    for (const table of ['shop_orders','order_events','product_events']) {
      await c.query(`DROP TRIGGER preserve_${table} ON ${table}`);
      await c.query(`CREATE TRIGGER preserve_${table} BEFORE TRUNCATE ON ${table}
        FOR EACH STATEMENT EXECUTE FUNCTION prevent_business_data_deletion()`);
      await c.query(`CREATE TRIGGER erase_${table} BEFORE DELETE ON ${table}
        FOR EACH ROW EXECUTE FUNCTION permit_scoped_order_erasure()`);
    }
    await c.query(`CREATE TRIGGER erase_work_history BEFORE DELETE ON moderator_work_history
      FOR EACH ROW EXECUTE FUNCTION permit_scoped_order_erasure()`);
    await c.query(`CREATE TRIGGER immutable_work_history BEFORE UPDATE ON moderator_work_history
      FOR EACH STATEMENT EXECUTE FUNCTION prevent_audit_mutation()`);
    await c.query(`CREATE TRIGGER preserve_work_history BEFORE TRUNCATE ON moderator_work_history
      FOR EACH STATEMENT EXECUTE FUNCTION prevent_business_data_deletion()`);
    await c.query('INSERT INTO shop_schema(version) VALUES(4)');
  });
}

export async function recordSubmission(c, order, member, outcome) {
  await c.query(`INSERT INTO moderator_work_history(order_id,moderator_id,assignment_round,outcome)
    VALUES($1,$2,$3,$4)`, [order.id, member.id, order.assignment_round, outcome]);
}

export async function eraseOrder(c, order, member, input) {
  if (member.role !== 'admin') throw new AppError(403, 'Only admin can permanently delete an order.');
  if (input.confirmPermanentDelete !== true || String(input.reference) !== String(order.reference))
    throw new AppError(400, 'Read the warning and explicitly confirm this exact order.');
  if (!Number.isSafeInteger(input.version) || input.version !== order.version)
    throw new AppError(409, 'The order changed. Reopen it before deleting.');
  await c.query("SELECT set_config('ghorepawa.erase_order',$1,true),set_config('ghorepawa.erase_actor',$2,true)", [order.id, member.id]);
  if (order.stock_reserved && order.product_id && !['dispatched','delivered','cancelled'].includes(order.status)) {
    await c.query(`UPDATE shop_products SET stock=CASE WHEN stock IS NULL THEN NULL ELSE stock+$2 END,
      version=version+1,updated_at=now() WHERE id=$1`, [order.product_id, order.quantity]);
  }
  await c.query('INSERT INTO order_request_tombstones(request_digest) VALUES($1) ON CONFLICT DO NOTHING', [erasedKey(order.request_key)]);
  await c.query("DELETE FROM product_events WHERE details->>'orderId'=$1", [order.id]);
  await c.query('DELETE FROM moderator_work_history WHERE order_id=$1', [order.id]);
  await c.query('DELETE FROM order_events WHERE order_id=$1', [order.id]);
  await c.query('DELETE FROM shop_orders WHERE id=$1', [order.id]);
  await c.query('INSERT INTO order_erasure_audit(actor_id) VALUES($1)', [member.id]);
  // Defence in depth: clear even before transaction-local settings expire.
  await c.query("SELECT set_config('ghorepawa.erase_order','',true),set_config('ghorepawa.erase_actor','',true)");
}
