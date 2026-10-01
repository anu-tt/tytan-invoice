# TYTAN DOOR Production Invoice App

## Included
- Email/password login and persistent sessions
- Offline-first invoice storage with automatic cloud sync
- Installable Progressive Web App with an offline app shell
- Realtime phone/laptop invoice and company-settings sync
- Persistent browser-storage permission and usage status
- Atomic invoice numbering at database insert; opening or abandoning a draft does not consume a number
- RLS-protected company and invoice data
- Fixed TYTAN DOOR-style invoice layout
- Supplied invoice artwork used as the fixed print/export template
- PDF/JPG/Excel export and mobile share
- Search, date/calendar filters, edit/copy/share, and recoverable invoice deletion
- Responsive PWA for phone and laptop

## Setup
1. Create a Supabase project.
2. Run `supabase-production.sql` in Supabase SQL Editor.
3. Configure Email/Password authentication and your production Site URL/redirect URL. Create the one permitted user in Supabase Dashboard → Authentication → Users, then disable public signups in Authentication settings. Change/reset its password through Supabase's dashboard; passwords are never stored in this app or SQL.
4. Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with this project's URL and publishable/anon key. These values are read by Vite at startup/build time; `.env.local` is ignored by Git. The publishable key is visible in browser code, so database security must come from RLS; never put a service-role key here.
5. Run `npm install`, then `npm run dev` for local development. Vite reads `.env.local` when it starts. If the Supabase variables are missing, the app now stays on the login screen and reports the missing configuration instead of opening local-only mode.
6. For deployment, configure those same `VITE_` variables in the hosting provider's environment settings before building. Never use a service-role key in browser code; the publishable/anon key is intended for client use and must be protected by the configured RLS policies.
7. Deploy the production build (`npm run build`) over HTTPS (Vercel/Netlify/Cloudflare Pages or similar). HTTPS (or localhost during development) is required for service workers and app installation.
8. The SQL creates a private company for each authenticated user. Invoices are readable and writable only inside that user's company. Delete moves an invoice to Recently Deleted; restore it there if needed. Hard deletion is not granted by the database.

Invoices and company settings are cached on-device under the signed-in user's Supabase ID for offline use. When the device is online and signed in, pending changes synchronize with Supabase; sign in with the same account on each device to access the same cloud invoices. Invoice numbers are assigned atomically when an invoice is inserted, including queued offline invoices, so opening or abandoning drafts does not consume numbers. Keep regular Supabase backups/PITR enabled for recovery; no web app can guarantee data is impossible to lose.

Invoice JPG and PDF exports use a crisp, responsive recreation of the supplied invoice design. The recreated page includes matching header logos, decorative banner, Hindi item table, watermark, total, work details, and contact footer, with invoice data rendered as text for sharp output. The fixed layout has room for up to 10 item rows.

Use **Install app** when the browser offers it. On iPhone/iPad, choose **Share → Add to Home Screen**. In Settings, request persistent browser storage to ask the browser to protect offline data from automatic cleanup; availability depends on the browser and device.

Supabase must be configured before the app can be used. Legacy local-only invoices remain in the browser's prior local storage and are not automatically imported into a signed-in account.

The recreated invoice template uses vector/CSS logos and flourishes instead of the low-resolution source scan.
