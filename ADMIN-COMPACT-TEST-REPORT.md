# Admin Compact — validation report

Application source commit: `065934cf3611f56086ac9b1a1fe8e96af4860cf9`.
Base: Glass Workflow v3 `5c9188120b7f943123f59e6c465c975f6d9da7d1`.
Branch: `feature/admin-compact-polish`.

Full successful review: https://github.com/mahinbro696-rgb/ghorepawa-website/actions/runs/39328920182

## Scope

Only 3 runtime files: new `public/admin/admin-compact.css`, modified `public/admin/admin.js` and `public/admin/index.html`. The additional stylesheet is scoped to the signed-in `.admin-mode` body class; the class is removed on logout. Shared baseline CSS, moderator inbox/history code, APIs, schema, storefront, startup and dependencies remain unchanged. No live database, credentials or ExonHost service were used or modified. All previous branches are left untouched.

## Presentation

Admin body 14px, table primary text 13px, heading 24px; smaller spacing, controls and sidebar. The desktop fixture's standard order row measured 77 CSS pixels at 1440px viewport. Rows with additional workflow details can be taller. Column widths are bounded, long names/products use ellipsis, notes have a two-line preview, dates/times use reused formatters, and the existing Open dialog retains full information. Status colors are preserved with quieter fills. Open and an accessible labelled Delete icon are aligned horizontally. Table scrolling stays inside the table on small displays; mobile input text remains 16px. Moderator body remains 17px.

## Corrected UI defects

- Cache hits no longer renew `teamCacheAt`. Previously frequent refreshes could retain stale moderator dropdown data indefinitely; only an actual team response renews the 60-second cache.
- Assignment requires both selected eligible orders and a moderator. Selection visuals and disabled state stay synchronized; a pending mutation cannot be re-enabled by changing selection.
- Long names/products/notes no longer stretch the order columns or inflate the entire row without limit. Dynamic text remains HTML-escaped.

## Completed checks

- JavaScript syntax, HTML IDs and local asset references: passed.
- 56 existing isolated SQL/unit/integration tests: 56 passed, 0 failed, 0 skipped.
- Static build: passed.
- Chromium synthetic-response regression: compact sizing, bounded row height, action layout, selection guards, real cache-expiry behavior, long-text overflow, HTML escaping, dashboard, products, notifications/sound controls, settings, team, logout and public catalog/checkout form passed.
- Real HTTP API + Better Auth + ephemeral PGlite PostgreSQL browser acceptance: logins, assignment, moderator isolation, callback/handoff/reassignment, minimal history, confirmation, courier/complete, consent-required deletion, removal from another open moderator session, status colors and staff badges passed.
- Mobile at 390px: navigation, input sizing, reduced motion and no document-level horizontal overflow passed.
- No uncaught browser JavaScript errors in these tested scenarios.

Local Node 24.21.0 source checks, build and 56 tests also passed. Local managed Chromium blocks loopback navigation, so browser tests and reviewed screenshots were obtained from the authorized isolated GitHub Actions runner rather than claiming a local browser pass.

## Limits

This is not a live ExonHost load test, production browser certification, comprehensive security audit or guarantee of zero future defects. Test screenshots use synthetic customers. No real order was created, deleted, reassigned or changed. Check the updated UI on ExonHost after installing all three frontend files. No server restart or dependency installation is required for this static-admin update with the existing V3 server.
