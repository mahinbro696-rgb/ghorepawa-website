# Client order controls and English panels - validation report

Branch: `fix/client-order-controls-english`.
Base: `0f4ca58ee1c98a364074013f86434793b6fecef0` (New orders queue).
Validated runtime source commit: `5eedd9ce969e0a442dfbd12208de92e385592b74`.
Successful review: https://github.com/mahinbro696-rgb/ghorepawa-website/actions/runs/39955744661

## Findings and corrections

The original server policy did not allow admin to confirm a New order directly and required Dispatched before Complete. The prior confirmed queue selected orders by moderator attribution rather than active confirmation status. The new policy and UI distinguish Confirm order, Complete order, Cancel order and Close. Admin can directly confirm or complete eligible open records; Cancel requires a reason. Confirmed orders now contains confirmed/approved/dispatched records including admin confirmations. Completed and Cancelled each have separate queues and counters. Completed and Cancelled remain final states, not silently reopened by assignment.

All orders bulk assignment has been tested in both selection orders and hardened with a retained target, visible inline failures, version checking, stale-read cancellation and disabled controls during writes. Eligible records are New, Assigned, Callback and Unapproved. Terminal or fulfilment-stage records cannot be distributed by mistake. A single-order assignment form is also available. The client's exact live failure was not reproduced on their production account; this is a tested correction and hardening of the current source, not a claim to have inspected their live login/session.

Moderator All orders is an intentional permission change requested by the owner. Every active moderator may read all orders' customer/contact/address/product/status information through an explicit read-only scope. Financials, private call notes, other staff identities, exports and management controls are excluded. Shared-list reading never grants permission to mutate another worker's order. Their own Inbox remains the only place to submit assigned work. Existing limited History and revoked/deleted record checks are preserved.

Admin and Moderator interface text, login/security forms, status labels, API validation messages, dates and number formatting are English. User-entered names, addresses and product content are not translated or rewritten. Public marketing copy is not redesigned.

## Verified checks

- Local Node 24.21.0 and isolated GitHub Actions: source syntax, HTML IDs and local asset references passed.
- 82 SQL/unit/integration tests passed, 0 failed and 0 skipped. Existing inventory, ordering, idempotency, callback, erasure, team and 2FA tests remain included.
- Static build passed.
- Existing Chromium presentation regression passed: admin compact sizing, selection, cache expiry, long-text escaping, products, notifications, sound controls, settings, team, mobile layout and storefront checkout form.
- Existing real HTTP/API workflow passed: login, assignment, callback/reassignment, minimal history, courier/complete, consent deletion and removal from another session.
- Inbox/search and New orders queue acceptance passed, including selected-only bulk handoff, failed-assignment retention, All orders preservation, search/glow and pagination.
- New actual-API browser acceptance passed: All orders target-first bulk assignment; simulated failed write keeps selection and displays error; retry succeeds; per-order assignment; admin New -> Confirm -> Complete; required-reason cancellation; distinct Cancelled/Completed queues; English labels; moderator shared read-only list; forbidden cross-worker writes; 390px mobile layout without document overflow.
- No uncaught browser JavaScript errors in the tested scenarios. Reviewed screenshots contain synthetic records only.
- SHA256s of all 17 deployment files from successful CI match the locally reviewed files.

## Scope and deployment

Exactly 17 runtime files: one new stylesheet and sixteen replacements. No database schema, dependency, startup, live environment variable or other branch was changed. No production order was created, assigned, changed or deleted. No live credentials were used or rotated.

Tests use the actual API handlers and Better Auth with a temporary PGlite PostgreSQL-compatible database. The test HTTP harness serializes its single-connection database requests; it does not measure production concurrency or Neon/ExonHost capacity. Browser tests ran on an isolated authorized GitHub Actions runner because local managed Chromium blocks loopback navigation. The source was published only after the complete suite passed.

Deploy all seventeen files together and restart Node because backend policy changed. No NPM install, schema migration or new secret is required. Verify a clearly labelled test order on the actual host after deployment. The result is not a guarantee of zero defects, zero downtime, unlimited traffic or a complete security audit. Previous disclosed credentials require separate remediation; this update does not rotate the authentication secret or affect existing 2FA keys.
