# QR-GAAP

QR-GAAP is a Next.js registration and group assignment app. Supabase stores the participant roster, group capacities, and registration mode. DLSL student lookups stay on the server.

## Connect this checkout to Supabase

1. In Supabase, open **Project Settings → API** and copy the Project URL, publishable/anon key, and `service_role` key.
2. Copy `.env.example` to `.env.local` in the project root.
3. Replace the Supabase placeholders in `.env.local`:
   - `SUPABASE_URL`: the Project URL.
   - `SUPABASE_ANON_KEY`: the publishable/anon key. This is used only by the server-side login route.
   - `SUPABASE_SERVICE_ROLE_KEY`: the `service_role` secret. It must remain server-only; never rename it to a `NEXT_PUBLIC_...` variable or put it in browser code.
   - `SUPABASE_ADMIN_EMAIL`: the one email address allowed to sign in to `/admin`.
   - `QR_GAAP_SESSION_SECRET`: generate a random value of at least 32 characters. In PowerShell, run `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"` and paste the result.
4. Set the existing DLSL values (`REG_KEY`, `PORTAL_BASE_URL`, `PORTAL_HELPER_PATH`) in the same file. `REG_KEY` is used only by the server.
5. In Supabase **Authentication → Users**, create the admin account whose email matches `SUPABASE_ADMIN_EMAIL`. The dashboard verifies that account’s password through Supabase Auth; no `profiles.role` update is needed.
6. In the Supabase SQL Editor, run [`supabase/schema.sql`](supabase/schema.sql) to create/seed the three registration tables (`groups`, `students`, and `event_settings`). It does not add the future game system. Then run [`supabase/runtime-functions.sql`](supabase/runtime-functions.sql) to create the server-side registration/group operations. That file recreates the registration RPC with the argument names used by the app and asks PostgREST to reload its schema cache. If you already have these three tables, compare their columns with `schema.sql` before running it; `create table if not exists` does not retrofit incompatible existing tables.
7. If the old `data.json` roster should be copied to Supabase, keep a backup and run `npm run db:import-json`. The importer inserts missing rows and does not overwrite rows already in Supabase. Add `-- --include-registration-mode` only if you also want it to copy the old JSON registration mode. It never edits or deletes `data.json`.
8. Run `npm run dev`, then open `/admin` and sign in. The public registration page and `/view` now read the same Supabase database.

For Vercel, configure the same environment variables in **Project Settings → Environment Variables**, then redeploy. Never add the service-role key to a `NEXT_PUBLIC_` variable.

## Registration modes

From `/admin`, choose one of the existing registration modes:

- **NFC Reader** reads the card UID and looks up the participant through the DLSL student API.
- **Student Number** accepts a typed student number and looks it up through DLSL.
- **Manual Name Entry** accepts a name directly without a lookup.

The selected mode is stored in `event_settings` and applies to the public registration page immediately. Admin can add a participant directly from the dashboard, select whether an optional identifier is a student number or NFC card UID, and assign that participant to the least-filled available group.

## NFC card reader

The browser input expects a USB NFC reader configured as a keyboard wedge (HID keyboard). Configure it to type the card UID as hexadecimal characters without a `0x` prefix or separators, ending with Enter or a short pause. Keep the registration page focused in the foreground while scanning. QR-GAAP normalizes the UID to lowercase and sends it to `/api/join`; `lib/api.ts` passes that value as the DLSL API’s `card_tag` parameter.

The website cannot detect whether a keyboard-emulating reader is physically attached. For a Vercel deployment, the scan still requires a reader connected to the computer displaying the registration page.

## Admin access

`/admin` uses a 12-hour HTTP-only signed session cookie created after Supabase Auth accepts the configured admin email and password. All admin write/export routes check this session. The service-role key stays on the server and is not included in browser bundles.

## Raffle export

From `/admin`, select **Export Names** to download `qr-gaap-student-names.json` for the raffle project:

```json
{
  "source": "qr-gaap",
  "exportedAt": "2026-01-01T00:00:00.000Z",
  "names": ["Student One", "Student Two"]
}
```
