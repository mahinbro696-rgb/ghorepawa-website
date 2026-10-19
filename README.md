# Ghorepawa / Ever Strong

Static Bengali storefront plus a Node.js order API and role-based team workspace at `/admin`.

## Requirements

Node.js 24+, Neon PostgreSQL, and Vercel Functions. Install with `npm ci`.

Required server-only environment variables:

- `DATABASE_URL`: the existing Neon integration connection string.
- `BETTER_AUTH_SECRET`: a random authentication secret of at least 32 bytes.
- `ADMIN_INITIAL_PASSWORD_HASH`: a Better Auth password hash for the one-time `admin` owner bootstrap. The plaintext password is never stored in source code.
- `APP_ORIGIN` (optional): canonical site origin. Vercel deployment hostnames are otherwise used automatically.

Never put these values in public assets, client-side build variables, source control, logs or chat attachments. `.env*` is ignored. Preview and production databases must stay separate.

## Owner login

The owner logs in directly at /admin with username admin. A server-only Better Auth password hash initializes the account. No public setup code or public owner signup exists. A database transaction and revision marker apply this configuration once, so later password changes are preserved. Changing the configured hash explicitly triggers a one-time owner password reset and revokes existing owner sessions. Team members are created in the panel and remain pending until activated. Cookies are HTTP-only and credentials are hashed by Better Auth.

## Workflow

Website order → New → admin bulk assigns to an active moderator → Assigned → Confirmed / Callback / Unapproved. Confirmed orders return to admin for Approved / Unapproved. Approved → Dispatched → Delivered (or Cancelled). Unapproved orders can be reassigned for a new call. Callback requires a future timestamp and a reason. All order changes and team account changes have audit records.

Moderators can access only their assigned orders and cannot approve orders themselves. Disabling a member revokes sessions. Changes check an order version to reject conflicting edits. Bulk assignment is transactional. Status filters, customer search, pagination, duplicate-phone indicators, staff workload, notes, history and password management are included. The panel displays Bangladesh time.

The public order endpoint validates data and prices on the server, enforces quantity limits, rate limits submission and accepts a persistent idempotency key to prevent duplicate retries. It does not expose customer records publicly. The storefront reports success only after database persistence.

## Development and validation

`npm run check` — JavaScript parsing, local asset paths and HTML IDs.

`npm test` — workflow, permission, validation and server-price tests.

`npm run build` — copies only public assets to dist. API handlers and server libraries are bundled separately by Vercel and are never served as static files.

`node --env-file=.env.local scripts/dev.mjs` — local Node server, using a separate development database and authentication secret. Never run automated test orders against a live customer database.

Schema and auth migrations execute once per schema version using a database advisory lock. Test migrations on preview before promotion. No local filesystem storage is used for orders or sessions.

## Hosting

Vercel config builds the static site and Node functions together in Singapore. A future move to ordinary PHP-only shared hosting requires a compatible Node runtime or a backend migration; uploading server modules to a public document root does not run them. Search indexing remains disabled pending the seller's launch decision.
