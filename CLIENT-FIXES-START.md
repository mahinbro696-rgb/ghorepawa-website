# Client order controls / English panels - installation

Branch: `fix/client-order-controls-english`. Base: latest New Orders / Inbox and Search UI. Earlier branches and the live ExonHost service were not modified.

## What changed

- Admin can Confirm a new order directly, and can mark an eligible open order Complete without being forced through the courier step. Confirm, Complete and Cancel are separate actions. Delivered and Cancelled remain final states; there is no automatic reopen or restock of a delivered order.
- Cancel requires a reason. The order appears in Cancelled orders and All orders. Confirmed orders contains only active confirmed/approved/dispatched records, including admin-confirmed orders; Completed orders is a separate queue.
- All orders supports bulk assignment of eligible New, Assigned, Callback and Unapproved orders. The target selection is retained during refresh. Inline errors explain failed batches; selection is kept on failure, writes are locked against duplicates, and no batch is partially applied. Completed, Cancelled and fulfilment-stage orders are not reopened by Assign. Eligible orders also have an Assign this order form in their details.
- Moderator now has All orders as a read-only list, in addition to own inbox and own history. This explicitly changes the earlier policy: active moderators can view customer/contact/address/product/status details for all orders. Financials, private call notes, staff identities, exports, deletion and management controls are not exposed. Only their own active inbox tasks can be edited. Access checks still remove deleted records.
- Admin/Moderator UI, login, security forms, status labels, messages, dates and numeric formatting use English. User-entered names, addresses and product descriptions are not translated or rewritten. Existing public marketing-page text is not rewritten.

## Files

Use `CLIENT-FIXES-MANIFEST.json` for the exact file list. There are 17 runtime files (16 replacements and 1 new CSS file).

Application root: `/home/bazarxbd/ghorepawa-app`. Do NOT use `public_html`.

| Folder | Upload new | Overwrite matching files |
| --- | --- | --- |
| `public/admin/` | `client-orders.css` | `admin.js`, `portal.js`, `work.js`, `search.js`, `index.html` |
| `api/` | none | `orders.js`, `notifications.js`, `login.js`, `session.js`, `security.js`, `team.js`, `history.js` |
| `server/` | none | `domain.mjs`, `http.mjs`, `auth.mjs`, `bootstrap.mjs` |

1. Extract the update ZIP on your PC. This is a patch, not a complete project: never delete whole directories.
2. Keep private copies of the replaced source files. Upload the new CSS first.
3. In a short maintenance window, stop the Node application (not Delete/Remove). The site cannot take orders while stopped.
4. Upload/overwrite the four `server` files, then seven `api` files, then four admin JavaScript files. Upload `public/admin/index.html` last.
5. Start the app, or Restart if you did not stop it. Backend policy has changed, so restarting is required. NPM Install, database reset/import, schema changes and new environment variables are NOT needed.
6. Hard-refresh both panels with Ctrl+Shift+R. Each moderator should close old tabs or sign out and sign in again to receive the new menus.

Keep every other file, `app.mjs`, `.env`, all CSS from earlier updates, `node_modules`, `public/uploads`, `DATABASE_URL`, `BETTER_AUTH_SECRET` and `APP_ORIGIN` unchanged. Documentation/manifest/hash/report files are for your PC, not required to run the app. This update does not change credentials or 2FA settings.

## Acceptance on your host

Use labelled test records, not actual customer fulfilment. Confirm an unassigned test order, complete it, and verify it is only in Completed and All orders. Cancel a separate order with a reason; verify Cancelled and All orders. Select multiple eligible orders from All orders and assign them to an active moderator; verify only selected orders move to the intended inbox. Moderator All orders must show other staff records read-only, without an update/delete form. Test own-inbox submission still works. Never ship test orders.

## Rollback and limits

Restore the 16 previous runtime files and restart to restore the old policy and UI; the unused new CSS may remain. Existing successful assignments and statuses remain saved. Do not reset or import the database. No production credentials or real customer data were used by development tests. Browser acceptance uses a temporary test database; this is not a live ExonHost capacity test or a guarantee of zero future errors.
