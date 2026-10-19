# Ghorepawa Portal v2 - ExonHost release guide

This upgrade is prepared on `feature/portal-management-v2`. It does not change `main`, `deploy/exonhost-node24`, the running ExonHost service, or any live credentials. It builds on `feature/admin-dark-navy-performance`.

## What this release includes

- Dark navy dashboard, mobile navigation, accessible focus states and reduced-motion support.
- Existing Bengali order, moderator, approval, callback, password and Google Authenticator workflows retained.
- Database-backed product creation/editing, SKU validation, drafts/publishing, whole-BDT pricing, stock tracking and image uploads (JPEG/PNG/WebP up to 2 MB).
- Public product collection and checkout at `/shop`; all orders reach the existing order queue.
- The original landing checkout gets the current default product's price, comparison price, availability, summary name and thumbnail from the database. Existing marketing copy and banner images are not generated or rewritten by the product editor. Update those assets separately when their printed offer text changes.
- Product/name/price snapshots on new orders. Old orders are not repriced. Stock is reserved on order submission and returned once after a valid cancellation. A price mismatch causes a clear retry message rather than silently charging a different price.
- Per-user notification read state, order/assignment/status activity, overdue callback counts, opt-in sound and optional desktop notifications without customer details.
- Current-page CSV export; existing admin-only full business JSON export now includes product records and product audit events. These are business exports, not complete PostgreSQL disaster-recovery backups.
- Reused number/date formatters, compact team dropdown query/cache, cancellable stale GET requests, non-overlapping polling, unchanged-data render suppression, and parallel order read queries.
- UTF-8 request parsing fixed for network chunks that split Bengali characters; duplicate form submissions are blocked; stale order/product updates are rejected instead of silently overwriting a colleague's change.

## Important limits

This is not a promise of zero defects, zero downtime, or unlimited traffic. Production capacity depends on ExonHost CPU/RAM/process limits, Neon limits, request latency and actual traffic. No high-traffic capacity benchmark has been performed against your host. Do not use production orders as load-test fixtures.

Notifications are polling-based: roughly every 15 seconds while the panel is visible. Background browser throttling can delay updates. The closed browser/app does not receive push notifications. Web Push, service-worker delivery, SMS, email, courier API, payments and Meta Pixel/CAPI are not implemented in this release. Sound needs a user interaction and browser permission policies still apply. Audio/notification failures do not block order work.

Product images are stored on the ExonHost filesystem under `public/uploads/products/`. Preserve this directory during every deployment. A Vercel preview cannot accept filesystem uploads and returns an actionable error; HTTPS image URLs remain supported there. An uploaded image that is never attached to a saved product is not automatically deleted.

The app continues to use your current Neon database, current authentication secret and server settings. **Do not regenerate `BETTER_AUTH_SECRET` as part of this update**: existing encrypted 2FA information can depend on it. Credentials previously disclosed in screenshots need a separately planned rotation, including any affected Vercel integrations and 2FA recovery. This upgrade does not claim they have been rotated.

## Files to upload

See `PORTAL-V2-MANIFEST.json`. This is a backend + frontend update, NOT the earlier three-file CSS update. Missing a new API/module can break requests.

Application root on the previously shown account:

```
/home/bazarxbd/ghorepawa-app
```

Use the actual application root shown in cPanel if the account path has changed. Do not upload the source to `public_html`. Do not delete the app directory, `node_modules` symlink, existing uploads, `.env` files, or cPanel-generated Passenger settings.

`package.json` and `package-lock.json` are unchanged. No new production dependency installation is required for this release.

## Deployment sequence

1. Unzip `ghorepawa-portal-v2-update.zip` on your PC. The folder paths in the ZIP are relative to the application root.
2. Upload the NEW files listed in the manifest into their matching directories. Upload `public/shop/` and the new API/server files before replacing files which reference them.
3. Replace the MODIFIED files listed in the manifest in a short maintenance window. Keep a private copy of the previously working files or deployment reference for recovery. Do not restore or overwrite the database from the code archive.
4. In cPanel -> Setup Node.js App -> the `ghorepawa.store` application, click **Restart** once after all files have been uploaded. Keep Node 24 / Production / startup `app.mjs` and the existing `APP_ORIGIN`, `DATABASE_URL`, `BETTER_AUTH_SECRET` unchanged.
5. The first API call runs additive schema version 3 under a PostgreSQL advisory lock. It creates products, product history and notification read-state tables, adds product snapshot columns/indexes, and seeds the existing Ever Strong product at 399 BDT. It does not delete existing orders/users/sessions or run a password reset. The first request can take longer during this migration. A normal database user used by this app must have the same migration permissions as before.
6. Open `/admin`, hard-refresh with Ctrl+Shift+R, and verify the new dashboard. In a separate private window verify `/moderator` with an approved moderator account.
7. Verify product drafts are not public; publish a test product, check `/shop`, test the correct total, assignment, moderator permissions, callback, cancellation/stock restoration, read/unread notifications, and opt-in sound. Clearly mark acceptance-test orders and do not dispatch them. Delete/reset is intentionally not available for business history.
8. Confirm `/` still loads and uses the correct default product price. Verify HTTPS and any image uploads on the actual host. Check the browser console/network and cPanel app logs for errors without sharing passwords/tokens.

## Recovery notes

If the frontend alone fails, restore the previous admin assets while keeping the new tested backend, then investigate. Do not delete the new schema or business records.

Do not blindly downgrade the order API to a pre-product version after catalog orders have been accepted: old handlers do not know how to reserve/return catalog inventory. Use a fixed version of the new backend or a controlled recovery plan. A code rollback is not a database rollback.

The old `ADMIN_INITIAL_PASSWORD_HASH` should not be changed or reintroduced with a different hash merely to solve a login issue. Ask for the specific error first; do not disable authorization or drop authentication tables.

## Isolated checks

```
npm ci
npm run check
npm test
npm run build
python -m pip install playwright
python -m playwright install --with-deps chromium
python tests/ui/portal-browser.py
```

Node 24 is required for the existing test command. Integration tests use PGlite and randomly generated temporary test credentials, not the live Neon database. Browser tests use synthetic API fixtures. They validate UI behavior, not live hosting capacity. Test screenshots contain demonstration data, not actual customer orders.
