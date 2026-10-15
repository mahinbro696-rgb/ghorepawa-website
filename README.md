# Ghorepawa / Ever Strong — first design draft

## Status
Initial responsive storefront design only. NOT a production shop. Form validation and quantity/price calculation work locally. No order submission, database, payment, admin authentication, Pixel or WhatsApp integration has been implemented. No fabricated testimonials or unverified health claims are added to site copy. The supplied packaging image contains seller claims; these have not been verified. Replace the screenshot asset with the original product photo before launch.

Confirmed details: Ever Strong, 120 g, regular BDT 2599, offer BDT 399, delivery free, contact +8809639224727. Cash on delivery, WhatsApp availability, ingredients, directions, policies and delivery timelines are unconfirmed.

## Preview
Use Node 20+:

    npm run check
    npm run build

Vercel: Import this repository, Framework Preset Other, Build Command `npm run build`, Output Directory `dist`. No dependencies required. Only `public/` is copied to the deployment; server source/config must never be exposed as static assets. Preview is marked noindex.

## Intended architecture
`public/` contains portable HTML/CSS/JS. The planned `server/` will contain a PHP/MySQL API and server-verified admin login; `database/` will contain migrations. These backend directories are currently placeholders. Vercel is for the static design preview. Test orders and admin against ExonHost staging before launch; uploading PHP backend to ordinary static Vercel hosting will not run it.

For cPanel production, place public files in `/home/bazarxbd/ghorepawa.store` and private server configuration outside the public document root. Import the future SQL migrations, configure a restricted DB user, verify SSL, orders and admin, then launch. Preserve existing cPanel PHP directives and HTTPS redirect. Do not upload this repository wholesale into the public document root.

## Next work
1. Confirm design and remaining seller information.
2. Implement order API with server-controlled prices, validation and anti-abuse limits.
3. Implement secure admin sessions, CSRF checks, login throttling, product editing and order status management.
4. Implement image upload constraints, migrations and environment configuration.
5. Test persistence, authentication, unauthorized access and failure handling on ExonHost staging.
6. Add approved policies and remove preview notices/noindex only at launch.

Never commit passwords, customer exports or production config. Keep GitHub repository private while developing.
