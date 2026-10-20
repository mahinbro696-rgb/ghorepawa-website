# Moderator Inbox and Admin Search

Prepared on `feature/moderator-inbox-search-polish`, based on Admin Compact (with Glass Workflow v3 already installed). No production or earlier branch is modified.

## Changes

- Moderator-only compact work rows, smaller navigation/header, visible phone links, bounded customer/product/note text, callback labels, responsive two-column mobile cards and 44px mobile actions. The two existing menus (inbox/history), work submissions and privacy rules remain unchanged. No money, graphs, other staff's work or settings are added.
- Admin order search uses parameterized case-insensitive literal substring matching across customer name, phone, address, area, district, product and ES reference. Multiple terms must all match somewhere in the same order. Unicode forms and Bengali digits are normalized; ES-5 / es 5 and formatted Bangladesh phone numbers are accepted. This is partial matching, not typo correction or transliteration.
- Searches cover the database, not just currently loaded rows. Existing section/status/assignee filters remain in force. 30 results per page, correct total and next/previous navigation retain access to all matches without loading unlimited customer records.
- Typing waits 350ms before searching, stale reads are cancelled, and input/caret remain in place. Explicit Search and Clear work too. Temporary failures leave the query editable with a retry message, not stale rows labelled as new matches.
- Subtle looping blue glow around search and matching rows; outside click, Escape, Stop glow and hidden-tab changes stop it without discarding results. Reduced-motion devices receive a static highlight. Search fragments are HTML-escaped before marking.

## Deploy all seven runtime files together

Use `INBOX-SEARCH-MANIFEST.json`. This ZIP is a patch, NOT the whole application. Never replace entire directories with it.

1. In cPanel File Manager, open `/home/bazarxbd/ghorepawa-app` (or the actual Application Root if changed).
2. Upload three new files first: `server/order-search.mjs`, `public/admin/inbox-search.css`, `public/admin/search.js`.
3. Keep a private local rollback copy of the four existing files being overwritten.
4. During a brief quiet maintenance window, Stop the Node application (not Delete/Remove). Orders cannot be accepted during this interval.
5. Overwrite `api/orders.js`, then `public/admin/work.js` and `public/admin/admin.js`, and finally `public/admin/index.html` in their corresponding directories.
6. Start the application, or Restart if it was not stopped. Backend search code changed, so this release needs a restart. No NPM install or database migration is needed.
7. Refresh `/admin` and `/moderator` with Ctrl+Shift+R. Check new rows, private work/history, name/phone/address/ES searches, paging, callback handoff and glow dismissal using marked test data only.

Leave `admin.css`, `admin-compact.css`, `portal.js`, `app.mjs`, all other APIs/server files, `node_modules`, uploaded images, database contents and environment variables unchanged. Do not re-generate the authentication secret.

The instructions, manifest, hashes and test report are for your PC; they do not need to be placed in the public web directory. Previously disclosed credentials are not used or rotated by this work.

## Rollback and limitations

Restoring the four previous files and restarting restores the previous UI/search; unused new files can remain. No schema rollback is required. Do not reset or import the database.

No live ExonHost load test or guarantee of zero defects, zero downtime or unlimited traffic is implied. Permission checks and privacy boundaries remain enforced by the server. Glow is cosmetic, not a signal that an order was saved or submitted. Partial search can scan many records; measure real host load before a large advertising campaign.
