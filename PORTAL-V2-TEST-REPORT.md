# Portal v2 validation report

Application source commit: `97060eda268111225b4a131540c9c811b14e0fc0`.

Validated source was published only to `feature/portal-management-v2`. No production branch was updated and no test uses the live Neon connection string.

## Completed checks

- `npm run check`: passed (JavaScript syntax, HTML IDs and local asset references).
- `npm test`: 43 tests passed, 0 failed, 0 skipped.
- `npm run build`: passed.
- Chromium desktop UI: dashboard, order list/details/history, product creation, notification read state, settings/sound button, team navigation and logout passed.
- Chromium moderator UI: role-specific navigation and absence of admin-only product/team/assignment controls passed.
- Chromium mobile UI at 390px: menu operation, no page-level horizontal overflow and reduced-motion layout passed.
- Public catalog UI: product list and checkout form passed.
- No uncaught JavaScript errors in those browser scenarios.

GitHub Actions execution with all validation and publication steps successful:
https://github.com/mahinbro696-rgb/ghorepawa-website/actions/runs/39312034207

The application tests also passed locally using Node 24.21.0. GitHub Actions used Node 24.22.0 and Playwright 1.64.0/Chromium.

## Database tests are real SQL, isolated from customers

The integration suite runs actual Better Auth and PGlite PostgreSQL logic with temporary test credentials. It covers additive/idempotent migrations, product CRUD permissions, drafts, duplicate SKU conflicts, stale product edits, server-owned pricing, immutable order snapshots, repeated order requests, insufficient stock, cancellation stock return, moderator scope, persistent unread state, admin-only image upload validation, business exports without credentials, retention protections and rejection of disabled moderators. The existing order/team/2FA workflow tests also pass.

Browser tests deliberately use synthetic API responses. They complement the database tests; they are not a live ExonHost end-to-end certification. Screenshots contain sample customer records only. The sound button was exercised without a JavaScript error; speaker audibility and device notification permissions must be checked in the user's browser.

## Still required on the actual hosting account

Deploy all 22 application files together, restart the Node application, then verify HTTPS, migration completion, product image filesystem permissions, real admin/moderator sessions, a clearly marked acceptance-test order, stock restoration after cancellation, and notification/sound preferences. Do not send the test order for delivery.

No production traffic benchmark, unlimited-capacity guarantee, zero-downtime guarantee, full security audit, payment/courier integration, closed-browser Web Push, SMS/email alerts or Meta Pixel/CAPI implementation is claimed by this release.

Previously disclosed live credentials were not used or rotated. Keep credential remediation separate from this deployment; changing the authentication secret without a recovery plan can affect existing 2FA.
