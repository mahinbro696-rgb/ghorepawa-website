# Moderator Inbox and Admin Search - validation record

Branch: `feature/moderator-inbox-search-polish`.
Base: Admin Compact `f07c26823532f92e4ecdeba32118fa52501570cf`.
First fully validated application commit: `8644cde3cc375886df3dbe0d858f3f2b2f196428`.
First complete successful CI run: https://github.com/mahinbro696-rgb/ghorepawa-website/actions/runs/39380536780

The final release additionally preserves numeric house numbers such as `12-3` and accepts partial Bangladesh country-code phone prefixes such as `+88017`. Those edge cases are included in the same real orders-API test suite. The final read-only branch CI repeats all checks on the exact release commit and packages that commit's files only after success.

## Verified changes and scope

Seven runtime files only: three new files (`server/order-search.mjs`, `public/admin/inbox-search.css`, `public/admin/search.js`) and four replacements (`api/orders.js`, `public/admin/admin.js`, `public/admin/work.js`, `public/admin/index.html`). Existing admin compact styling remains in place. Moderator appearance is scoped to moderator mode. No schema migration, dependency, production startup or storefront changes. Earlier branches and the live ExonHost service are not modified.

Moderator rows use a compact desktop column layout and responsive mobile cards; name, phone, delivery area, product and note are bounded. Full details remain in Open task. Body text is 15px, mobile fields remain 16px and action touch targets remain 44px. Only inbox/history navigation is retained; financials, other staff work and management settings remain excluded. Callback submission and reassignment keep their label, note and future time.

Admin search performs parameterized, escaped, case-insensitive substring matching over customer name, phone, full address, area, district, product and ES reference. Each search word must match somewhere in the same order. Bengali digits and Unicode forms are normalized. No fuzzy typo correction or transliteration is claimed. The database is searched, not only the first loaded page; 30 rows per page and totals preserve access to all matches. Existing section/status/assignee and mandatory role filters are unchanged.

Typing is debounced for 350ms with old reads invalidated immediately; Search and Clear are available. Input/caret survive refreshed results. Matched text is safely escaped before highlighting. Temporary failed search leaves the query editable with a retry message instead of showing old rows as new matches. A subtle looping glow highlights the current search and result rows; outside click, outside keyboard focus, Escape, Stop glow and a hidden tab dismiss it without clearing results. Reduced-motion mode disables the animation.

## Checks completed

- Local Node 24.21.0: source/asset checks, build and all 63 SQL/unit/integration tests passed, zero failures or skipped tests.
- Isolated GitHub Actions: source checks, build and all 63 tests passed on the first review, including seven new search tests. Existing order, product, inventory, permission, callback, deletion and 2FA tests are retained.
- New real-API search tests use Better Auth and an ephemeral PGlite PostgreSQL database. Cases include multiple matches, name and address terms, district/area, Bengali digits, ES formatting, formatted phones, pagination over 40 matching records, section/status scopes, literal SQL wildcard characters, hostile input, invalid pages, anonymous rejection and moderator isolation.
- Existing Chromium synthetic API UI regression passed for admin compact sizing, assignment guards, cache expiry, products, notification/sound controls, team, settings, mobile and public catalog.
- Existing real HTTP/API browser workflow passed for admin and moderator login, assignment, handoff, callback/reassignment, confirmation, courier/complete, limited history and consent-required erasure.
- New real HTTP/API Chromium acceptance passed for compact moderator rows, long-text bounds, callback layout, no other staff's customers or financial fields, partial admin name/address/phone/reference searches, marked matches, live-search debounce, input/caret preservation, stale-result cancellation, failure/retry, Clear, looping glow, outside-click/Escape dismissal, no glow resurrection on background refresh, hostile markup escaping and 390px mobile/reduced-motion layout.
- No uncaught browser JavaScript errors were observed in those scenarios. Screenshots were visually reviewed and contain synthetic records only.

Local managed Chromium does not permit loopback navigation; browser tests were run on the authorized isolated GitHub Actions runner instead. CI has read-only repository permission after publication, captures stderr and uses bash pipefail so logging cannot hide test failures. No production database URL, existing secret or customer account was used.

## Limits and deployment acceptance

All seven runtime files must be deployed together. Restart is required because orders.js imports the new server module. No database reset/import, secret regeneration or npm install is needed. This package assumes Glass Workflow v3 and Admin Compact are already installed.

Real ExonHost latency, large-dataset query costs, browser sound audibility and production concurrency were not benchmarked. Substring search may scan many records, so no unlimited-traffic claim is made. No guarantee of zero future defects or downtime is made. Perform a clearly marked acceptance test after deployment and do not ship test orders.
