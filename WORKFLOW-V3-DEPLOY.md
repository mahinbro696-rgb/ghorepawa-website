# Ghorepawa Glass Workflow v3

Branch: `feature/glass-workflow-v3`, based on Portal v2 commit `bdb63e83668be54c4cb4f7375e7bab1c58ea571e`.
This release is a coordinated backend + frontend change, not a CSS-only update.

## Requested workflow

- Admin Panel: larger fonts, bounded glass surfaces, color + text status indicators, moderator identity badges, orders, Call Back Later and Confirmed by Moderator queues.
- Moderator Page: only My work inbox and My history. No business dashboard, money, graphs, team listing, products or settings navigation. The API also excludes financial fields and other moderators' data; this is not just hidden CSS.
- A moderator submits one outcome: Confirmed, Call Back Later, or Cancelled. Callback requires a future time and note; cancellation requires a reason.
- Submission creates a minimal receipt and clears the active assignment in one transaction. History exposes only reference, the user's own submitted outcome and time. There is no customer name, phone, address, money, note or link back to full order details.
- Callback work returns to admin. Reassigning it preserves callback status, time, note and the Call Back Later customer marker. It may be assigned to the same or a different active moderator. Each assignment round can be submitted once.
- Moderator confirmation returns to the admin's Confirmed by Moderator section. Admin can send it to courier and subsequently select Complete. Complete maps to the existing delivered status.
- Green = Complete; yellow = callback; red = cancelled/unapproved; purple = moderator confirmation; courier/approved = blue. Colors are accompanied by text labels.
- Staff identity uses a stable database-assigned number, palette and symbol. Palette colors cycle after 24 members; the M-number remains distinct.

## Permanent deletion: exactly what it does

The delete action is for ONE ORDER, not the product catalog or every order belonging to a customer. Admin opens a warning, ticks the consent checkbox and presses Yes. The API independently requires an active admin session, explicit boolean consent, matching order reference and current version. Stale, missing or forged confirmations fail without deleting data.

An authorized deletion removes that order, its customer details and notes, its order events, its moderator receipts and product-audit links containing its order ID. Linked in-panel notifications disappear because they are read from remaining order events. Other orders, products, staff and unrelated audit history remain.

A minimal record of which admin used erasure and when is kept WITHOUT the deleted order ID, reference or customer information. An irreversible hash of its random idempotency UUID prevents stale browser retries from recreating the removed order. It contains no customer information. Normal data deletion, TRUNCATE and audit edits remain blocked except for the transaction-scoped, row-bound erasure path. A database owner can still change database objects; these safeguards are not a substitute for database access control.

Reserved stock is returned when deleting an order that has not been dispatched/delivered/cancelled. Deleting a shipped or completed record does not claim the physical item has returned. Normal cancellation retains the existing stock-return policy. No order is deleted automatically by installing this release.

**Limits:** This does not erase an earlier downloaded CSV/JSON export, hosting/database backup, screenshot, another person's notes or a courier's external copy. Moderator API access is revoked as soon as the transaction commits. An online, visible panel normally removes stale inbox/dialog content on the next roughly 15-second check, even during editing. Browser/network throttling or an offline device prevents an absolute instant-removal guarantee. Hidden/offline moderator tabs clear displayed customer data and require a fresh access check.

## Deployment on the existing ExonHost account

Use `ghorepawa-workflow-v3-update.zip` and the exact file paths in `WORKFLOW-V3-MANIFEST.json`. It assumes Portal v2 is already installed. Do not replace a whole directory with this partial package and do not delete unchanged files.

Application root previously shown: `/home/bazarxbd/ghorepawa-app` (use the actual cPanel root if changed).

1. Extract the ZIP on your computer. Keep documentation locally.
2. Add the new files first, under their matching api/server/public/admin directories.
3. During a short maintenance window, stop the Node application, then overwrite every modified application file in the manifest. This window temporarily prevents orders; do not claim zero downtime.
4. Do not touch `node_modules`, `.env`, cPanel-generated Passenger configuration, existing `public/uploads`, database connection or authentication secrets. There are no dependency changes; NPM Install is not required.
5. Start the app (or Restart if it was not stopped). The first API request applies schema version 4 once. It preserves existing order/customer values and migrates legacy finished moderator work to restricted receipts.
6. Hard-refresh `/admin` and `/moderator`. Test a labelled sample order: assign, callback with note/time, reassign, confirm, send to courier, Complete. Test Delete only on an explicitly disposable test order. Do not send any test order for delivery.

Do not import/reset/drop a production database to install or roll back this release. Any rollback must consider schema v4 and the changed workflow, not merely revert the CSS. Database-owner privileges are necessary for the versioned ALTER TABLE/trigger migration; a failed migration should be diagnosed, not worked around by deleting tables.

## Appearance and performance

Base body text is 17px; input controls 17px; metadata generally 14px or larger; task phone links 23px. Glass blur is limited to navigation/header/dialog surfaces, not every row. Reduced-motion, reduced-transparency, high-contrast preferences and opaque fallbacks are included. No new animation library is loaded.

The storefront/product catalog remains unchanged. This release does not add Meta Pixel, CAPI, closed-browser push, SMS or email delivery. Existing notification sound remains opt-in. Existing credentials were not used or rotated. Keep authentication-key/2FA remediation separate from a file deployment.
