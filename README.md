# QR-GAAP

QR-GAAP is a Next.js registration, group assignment and event game app. Supabase stores the participant roster, group capacities, registration mode, game rounds and scores. DLSL student lookups stay on the server.

## Connect this checkout to Supabase

1. In Supabase, open **Project Settings → API** and copy the Project URL and `service_role` key.
2. Copy `.env.example` to `.env.local` in the project root.
3. Replace the Supabase placeholders in `.env.local`:
   - `SUPABASE_URL`: the Project URL.
   - `SUPABASE_SERVICE_ROLE_KEY`: the `service_role` secret. It must remain server-only; never rename it to a `NEXT_PUBLIC_...` variable or put it in browser code.
   - `QR_GAAP_SESSION_SECRET`: generate a random value of at least 32 characters. In PowerShell, run `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"` and paste the result.
4. Set the existing DLSL values (`REG_KEY`, `PORTAL_BASE_URL`, `PORTAL_HELPER_PATH`) in the same file. `REG_KEY` is used only by the server.
5. In the Supabase SQL Editor, run [`supabase/schema.sql`](supabase/schema.sql) to create/seed the three registration tables (`groups`, `students`, and `event_settings`). Then run [`supabase/runtime-functions.sql`](supabase/runtime-functions.sql) to create the server-side registration/group operations. That file recreates the registration RPC with the argument names used by the app and asks PostgREST to reload its schema cache. If you already have these three tables, compare their columns with `schema.sql` before running it; `create table if not exists` does not retrofit incompatible existing tables.
6. Run [`supabase/admin-credentials.sql`](supabase/admin-credentials.sql) to create the restricted, single-row `admin_credentials` table.
7. In a terminal at the project root, run `npm run admin:set-password`. Enter the initial admin password when prompted; input is hidden. The command generates a salted scrypt hash locally and sends only that hash to Supabase. The password is not written to `.env.local` or a project file. This command can also be used later to rotate the password.
8. If the old `data.json` roster should be copied to Supabase, keep a backup and run `npm run db:import-json`. The importer inserts missing rows and does not overwrite rows already in Supabase. Add `-- --include-registration-mode` only if you also want it to copy the old JSON registration mode. It never edits or deletes `data.json`.
9. Run `npm run dev`, then open `/admin` and enter the single admin password. The public registration page and `/view` read the same Supabase database.

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

`/admin` accepts one shared password. The server verifies it against the scrypt hash in the `admin_credentials` table, then creates a 12-hour HTTP-only signed session cookie. The hash is never sent to the browser. All admin write/export routes check this session, and the Supabase service-role key stays on the server.

## Raffle export

From `/admin`, select **Export Names** to download `qr-gaap-student-names.json` for the raffle project:

```json
{
  "source": "qr-gaap",
  "exportedAt": "2026-01-01T00:00:00.000Z",
  "names": ["Student One", "Student Two"]
}
```

## Games and live scoring

1. After the registration setup above, open [the game migration](supabase/migrations/202610080001_game_management.sql), copy **the entire file**, and run it once in the Supabase SQL Editor. It extends the existing game tables without replacing participant data. No new production environment variables are needed.
2. Open `/admin` and select **Games Management**. Configure Maze placement points and the Charades duration/word deck.
3. Create a facilitator code for each group and share that code privately with its facilitator.
4. Facilitators open `/games`, choose a game and their group, and enter the group's code.
5. Admin uses **Prepare**, then **Start**. Only one game can run. Use **End** to preserve results, or the separate confirmed **Reset** to archive that game's scores.
6. Show `/gameview` on the event display; `/score` contains the overall leaderboard. Both update automatically every two seconds.

See [implementation, APIs, decisions and verification](docs/game-management.md) for corrections, round rules and deployment limitations.

### Development checks

```sh
npm test
npm run lint
npm run typecheck
npm run build
```

The production build uses Next.js's supported Webpack compiler because the installed Windows Turbopack CSS worker failed to start reliably.

For a disposable browser preview, run `npm run preview:games`. Open `http://127.0.0.1:3022/games`; the test admin password is `preview-password-only`, and group codes are `preview-group-1` through `preview-group-14`. This process overrides Supabase settings with a local, temporary PostgreSQL fixture and never writes to the real project. With it running, run `npm run test:games:http` in another terminal for the HTTP integration checks. Stop the preview with Ctrl+C when finished. These test credentials are never installed in the production database.
