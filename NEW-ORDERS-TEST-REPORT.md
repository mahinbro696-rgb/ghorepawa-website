# New orders queue — validation report

Branch: `feature/admin-new-orders-queue`.
Base: `56d39f77627133c23b26da9b956ba4b899ed259f` (Moderator Inbox and Search).
Validated application source: `4123d8125ab16910013a3e3f1716fffbd42c589a`.
Successful full review: https://github.com/mahinbro696-rgb/ghorepawa-website/actions/runs/39384307630

## Scope

Four frontend files only: `public/admin/admin.js`, `portal.js`, `search.js`, and `index.html`. No API handler, database schema, startup file, stylesheet, dependency or live environment variable was changed. All previous branches and the live ExonHost service were left untouched. Temporary source transport was removed after validation.

The new admin sidebar section and dashboard shortcut open a fixed `status=new&assignee=unassigned` server-filtered queue. Existing server permissions and atomic/version-checked bulk assignment are reused. On success only assigned records leave New orders; unselected new records remain, and All orders preserves every record. Search is confined to this queue. Status/assignee filters cannot accidentally broaden it. Empty queue messaging and last-page recovery are included. Moderator navigation and permissions remain unchanged.

## Completed checks

- Local Node 24: syntax/assets, build and 70 SQL/unit/integration tests passed (0 failed, 0 skipped).
- GitHub Actions Node 24: syntax/assets, build and 70 tests passed (0 failed, 0 skipped).
- New SQL/API tests cover new-only/unassigned filtering, mixed statuses in All orders, selected-only assignment, stale mixed batch rollback, inactive moderator rejection, moderator isolation, anonymous rejection, empty/refill behavior and pagination across 31 waiting records.
- Existing Chromium presentation tests passed for compact sizing, row selection, assignment guards, team cache expiry, long text/escaping, products, notifications/sound controls, settings, logout, mobile layout and public catalog.
- Existing actual API browser workflow tests passed for admin/moderator logins, assignment, callbacks/reassignment, limited history, confirmation, courier/complete and consent-required deletion.
- Existing inbox/search browser tests passed for partial name/address/phone/reference search, debounce, stale-read handling, failure/retry, highlight dismissal and mobile layout.
- New browser acceptance passed for the sidebar and dashboard shortcut, fixed filters, queue-scoped search, failed-assignment selection retention, bulk assigning a subset, retaining the same orders in All orders, showing them only to the intended moderator, assigning the remaining queue, new incoming work, automatic last-page fallback and mobile navigation.
- No uncaught browser JavaScript errors were observed in these test scenarios.
- Deployment file SHA256s from CI were verified against the locally reviewed runtime files. Preview screenshots contain only synthetic customers.

## Test boundaries

Actual application API handlers and Better Auth run against a disposable PGlite PostgreSQL-compatible database. Browser scenarios use actual HTTP API requests except explicitly simulated network failures and the deterministic UI last-page fallback. SQL pagination is tested separately using actual queries. The test HTTP server serializes its single-connection database requests; this is not a production concurrency/load test.

Local managed Chromium blocked loopback navigation, so browser verification was performed on the authorized isolated GitHub Actions runner. No production hostname, live database URL, real customer or existing secret was used. No live order was created, assigned or deleted.

After uploading the four frontend files to ExonHost, hard-refresh and verify one clearly labelled test order. This frontend-only release needs no Node restart, NPM install or database migration with the existing server. No zero-defect, zero-downtime or unlimited-capacity guarantee is made.
