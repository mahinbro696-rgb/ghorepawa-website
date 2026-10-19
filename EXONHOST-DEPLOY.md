# ExonHost deployment (Node.js 24)

This branch is staging only. Keep the Vercel production deployment and existing database running until acceptance tests pass.

## Prerequisites
- cPanel -> Setup Node.js App -> Node.js 24.21.0, Production, application root `ghorepawa-app`, URI `ghorepawa.store` (root URL), startup file `app.mjs`.
- Ensure ghorepawa.store is added as a domain in cPanel, with the correct document root, before creating the app.
- Install the repository **outside public_html** under `/home/<cpanel-user>/ghorepawa-app`. Never expose source code, env files or `node_modules` in a public directory.
- Use cPanel's Node.js app environment and `Run NPM Install` (or its SSH virtualenv instructions) to install production dependencies; `npm ci --omit=dev` where supported.
- If your CloudLinux/Passenger environment exposes PORT, use its configured port: `app.mjs` listens on `process.env.PORT || 3000`.

## Server-side environment settings
Set these in cPanel Node.js Application -> Environment variables, not in Git:
- `DATABASE_URL`: existing Neon PostgreSQL pooled connection string (back up first).
- `BETTER_AUTH_SECRET`: existing secret from your working deployment. **Do not regenerate during migration** if you want to preserve the key used for existing auth operations.
- `APP_ORIGIN`: `https://ghorepawa.store`
- `ADMIN_INITIAL_PASSWORD_HASH`: only if you know and intend the existing bootstrap hash. Be careful: changing this value can reset the admin's password and revoke sessions.
- `NODE_ENV`: production (cPanel's Production mode sets this).

Do not publish these credentials or share them in screenshots.

## Validation, before changing DNS
1. Verify `npm run check` and `npm test` in a non-production environment with a test database.
2. Ensure HTTPS at the final hostname, and cPanel reverse proxy forwards expected `Host`/cookie headers.
3. Test `/`, `/admin`, `/moderator`; check assets and routing.
4. Test `/api/session` without credentials (must not leak user details); inspect browser network.
5. Use **a separate test database** to test order creation, admin/moderator login, 2FA and history. Do not place destructive or test orders in the live database.
6. Configure independent encrypted PostgreSQL backups and verify recovery.
7. Only after everything is validated, change Namecheap DNS to the hosting provider's confirmed IP / nameservers. Retain Vercel for rollback during transition.

This branch adds a plain Node HTTP entrypoint; it does **not** perform database migrations or alter production credentials. ExonHost's Passenger integration and cPanel rewrite/domain configuration must be tested on the actual host. If the host requires a different entrypoint contract, adapt this branch before launch.
