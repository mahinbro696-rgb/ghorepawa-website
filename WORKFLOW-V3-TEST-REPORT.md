# Glass Workflow v3 - validation report

Application source: `05004bac7d5194c7c93a17afc003077a8fd2b854`, published only to `feature/glass-workflow-v3`.

Successful full review: https://github.com/mahinbro696-rgb/ghorepawa-website/actions/runs/39323573744

## Verified checks

- `npm run check`: JavaScript syntax, local assets and HTML IDs passed.
- `npm test`: 56 tests passed, 0 failures, 0 skipped. These include the existing products/inventory/order/team/2FA tests, v2-to-v4 legacy migration, new moderator handoff workflow and scoped order erasure tests.
- `npm run build`: passed.
- Existing synthetic-response Chromium browser regression: desktop dashboard, orders/details/history, products, notifications, sound controls, settings, team, logout, restricted moderator menus, mobile layout, and public catalog passed.
- New Chromium acceptance test uses an actual local HTTP server, the actual application API handlers and Better Auth with a temporary PGlite PostgreSQL database. It is not merely a mock API UI test.
- This real-API browser test passed: admin/moderator logins; bulk assignment; no other moderator's task; financial data omitted from moderator responses; no graphs/settings/products/team navigation; callback note/time handoff; reassignment preserving callback identity; limited history; moderator confirmation; courier and Complete; disabled Delete button until consent; cancellation of the Delete dialog without deletion; actual single-test-order erasure; removal from another open moderator dialog on the next access check; four distinct status colors; stable moderator badges; 17px body text and mobile field size; 390px layout without page-level overflow.
- No uncaught browser JavaScript errors were observed in these scenarios.

GitHub Actions used Node 24.22.0, Playwright 1.64.0 and Chromium. Local SQL/source checks also passed with Node 24.21.0. No production hostname, live database connection, live login or customer data was used. Samples in screenshots are synthetic; do not ship test orders.

## Bugs corrected during verification

The new content-state data attribute initially collided with navigation button selectors. It now uses its own `data-current-view`, leaving `data-view` for navigation only. CI explicitly uses bash with pipefail and captures stderr, so a failed test cannot be hidden by a successful log-writing pipeline. Permission-refresh responses are applied only to the order IDs tracked in that request, avoiding a stale empty response clearing a newly loaded inbox.

## Erasure and privacy boundaries

Delete means the selected order and its customer details/notes/order events/moderator receipts, not catalog-product deletion or every order of that customer. Explicit active-admin permission, boolean consent, matching reference and current order version are checked server-side. Original retention protections remain for unrelated data and TRUNCATE. Installation itself deletes no orders.

A customer-free audit of the admin action/time and a hash of the random request UUID remain. Previously downloaded exports, provider backups, screenshots and external copies cannot be erased by this button. Server access is revoked at commit; an online visible moderator tab normally clears the stale item/dialog on its next approximately 15-second permission check. Hidden/offline tabs clear displayed customer details and revalidate on return. This is not a guarantee that another person can never remember or copy information they were previously authorized to see.

## What still needs the actual host

Deploy the 16 application files together, restart the Node app and verify migration completion, actual sessions, HTTPS and a clearly labelled acceptance-test order on ExonHost. The test HTTP server serializes database requests to suit its ephemeral single-connection test database; it is not a production concurrency/load benchmark. No unlimited-traffic, zero-downtime, zero-defects or complete security-audit claim is made. Browser audio audibility and operating-system alert settings need checking on the user's device.

No live credentials were rotated or published. Keep remediation of credentials previously disclosed in screenshots separate from this update; changing the authentication secret affects encrypted 2FA data. Main, the ExonHost production branch and Portal v2 were not modified or deployed by this work.
