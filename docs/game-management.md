# Game management implementation

## Existing architecture

QR-GAAP uses Next.js 16 App Router, React 19, TypeScript, Tailwind 4 and scoped CSS modules. Route handlers call Supabase REST and PostgreSQL RPC functions through the existing server-only client. There is no ORM or websocket server. `/admin` uses a shared password and a signed HTTP-only cookie. Registration, participant management, NFC input and `/view` are retained.

The connected database already has `games`, `game_rounds`, `maze_results`, `maze_scoring_rules`, `charades_settings`, `charades_words`, `charades_round_words`, `charades_attempts`, `score_adjustments` and `audit_log`. The migration extends these tables and uses the existing `groups`. Supabase Auth profiles are not required for the shared admin/facilitator access model.

## Decisions made while the owner is away

- Facilitators receive an admin-issued random access code for a specific group. A signed session remembers that group. Changing groups requires an intentional confirmation and that group's code. Rotating a code revokes existing sessions for that group.
- Maze defaults to 100, 90, 80 and so on, floored at zero; positions beyond the configured list use a configurable nonnegative fallback (default zero).
- Charades defaults to exactly 600 seconds, one point for correct and zero for skip. Every group uses the same ordered deck. Duplicate words are prevented without deleting historical snapshots.
- Settings, eligible groups and Charades words are snapshotted when a round starts. Changing participant names/capacities does not change scoring eligibility.
- Overall scores sum all unarchived rounds of each game. Preparing another round preserves earlier points; reset archives all rounds of only that game.
- Saving an old settings or word-deck draft is rejected if another admin session changed the game configuration. Discard the draft to reload the latest values. Corrections similarly verify the original answer outcome.
- Prepare creates a pending round. Only one game may run at once. Start/end commands carry the expected round and an idempotency key.
- Reset archives all scoring rounds belonging to the selected game, clears its current round and returns it to inactive. Other games retain their scores. Archived results and audit entries remain in the database.
- Undoing a Maze finish removes that recorded finish, re-ranks the remaining completions in server-recorded order and recalculates their placement points. The removed record and before/after rankings are audited. The affected group can finish again.
- Charades corrections update the recorded outcome using the round's scoring snapshot and audit both values. Signed score adjustments require a reason and are recorded as separate events.
- Timers use database timestamps and a measured server clock offset. Displays fetch snapshots every two seconds, resynchronize on focus/reconnect, and keep their last successful snapshot visibly marked when offline.
- The projector shows final Charades rankings for 30 seconds after natural expiry, then returns to the waiting screen. Preparing the next game ends that final display immediately.
- Shared admin access cannot identify individual people. Audit records identify the signed admin/facilitator session; they do not invent Supabase Auth users.

## UI plan

Reuse the site's paper (#faf9f6), background (#f0eee4), black (#111111), red (#d92323), and gray (#737373). Oswald carries titles and score/timer numerals; Comic Neue carries instructions and member-facing text. Use the supplied circular JPCS logo, thick black frames and offset shadows. Gold (#d9b44a), silver (#b6bec8), and bronze (#b8794d) are restricted to the top three ranking markers, with visible rank numbers.

`/games` puts the current group and game above a large action area. Correct and Skip are separated vertically on phones. `/gameview` gives the timestamp-based timer a prominent position and uses a responsive grid of group results. `/score` uses one leaderboard with game columns on desktop and score detail within rows on phones. Admin game controls sit in a separate Games section above the existing registration tools.

## Setup

After the existing registration schema and admin credential setup, run the entire file `supabase/migrations/202610080001_game_management.sql` in the Supabase SQL Editor. It is additive, does not modify the participant roster, and seeds only game definitions and configuration. Run one migration at a time. It also reloads PostgREST's schema cache.

No new production environment variable is required. Keep `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `QR_GAAP_SESSION_SECRET` on the Next.js server. The same setup works on Vercel; there is no separate Render server or local NFC bridge.

**Live setup status, October 8, 2026:** the connected Supabase schema was inspected read-only. The game migration has not been applied there: there is no database connection/management credential in this checkout, and the available Supabase dashboard browser redirected to sign-in. The service-role REST key does not provide a SQL Editor session. All game writes and sample scores during this implementation were confined to disposable test databases.

To finish live setup:

1. Sign in to the existing Supabase project and open **SQL Editor → New query**.
2. Open `supabase/migrations/202610080001_game_management.sql` locally. Select and copy **all** of it, including `begin;` and `commit;`.
3. Paste it into that empty query and click **Run** once. It creates missing game tables, extends earlier tables, installs RPCs, restricts direct browser access, seeds configuration and reloads the API schema cache. Do not run multiple copies simultaneously.
4. Open the website's `/admin`, sign in with the existing shared admin password, and select **Games Management**.
5. Set scoring, load your actual Charades words and issue the group codes. Prepare and start the game only when the event is ready.

Open `/admin`, select Games, configure scoring and the Charades deck, and issue a group code to each facilitator. Facilitators open `/games`, select their group and enter its code. `/gameview` and `/score` are public read-only screens.

## Integrity and synchronization

PostgreSQL transaction advisory locks serialize game mutations; database uniqueness independently protects round/group finishes, placement numbers and per-group word attempts. `clock_timestamp()` is read after acquiring the lock so queueing cannot backdate a finish or an expired answer. All game RPCs and base game tables are restricted to `service_role`; Next.js route handlers enforce admin or group-bound facilitator authorization before using that key.

Public snapshots omit Charades words, access code hashes and facilitator sessions. An answer must reference the server's next unattempted round word. A retry returns an existing record without adding points. A reused request ID for a different action is rejected. Scores are derived from result records and adjustments, with one shared deterministic ranking function.

Charades expires during authoritative snapshot/action requests even if no facilitator is currently submitting. The browser countdown reaches zero without another request and immediately disables answer controls. The server independently rejects new answers at or after the deadline. A naturally expired Charades round is labeled as final on the projector; other ended rounds yield a waiting screen with the overall leaderboard.

## Verification

Database tests run against isolated PostgreSQL via PGlite, never against competition results in the connected Supabase project. They execute the actual migration/RPCs and cover valid transitions, exclusive running state, Maze ordering/retries, Charades independent progress/deadlines/exhaustion, corrections, reset isolation and RPC privileges. Node tests cover ranking, timers, route authorization and simulated clients. Lint, TypeScript and the production build are also required. Record any environmental limitation separately from passing checks.

## API and schema reference

| Route | Access | Purpose |
| --- | --- | --- |
| `GET /api/games/state` | Public | Sanitized, authoritative game and scoreboard snapshot |
| `GET/POST/DELETE /api/games/session` | Group code for sign-in | Check, establish or end the signed facilitator session |
| `GET /api/games/facilitator` | Facilitator | Snapshot plus that group's next Charades word |
| `POST /api/games/maze/finish` | Facilitator | Atomic finish using the group in the verified cookie |
| `POST /api/games/charades/answer` | Facilitator | Record the expected word as correct or skipped |
| `GET/POST /api/admin/games` | Existing admin cookie | Live monitoring; prepare/start/end/reset, settings, word deck, group codes, undo/correct/adjust |
| `GET /api/admin/games/attempts` | Admin | Keyset-paginated correction history for the current Charades round |

The additive migration extends the existing game/result/configuration/audit tables. It adds `game_round_groups`, `facilitator_credentials`, `game_action_receipts`, round configuration snapshots and archive markers, request IDs, audit session labels and ordered word decks. It installs seven restricted RPC/helper functions and the service-only `gaap_game_score_events` view. Existing `groups` are reused. The migration preserves configuration on reruns and creates no word deck, completions or scores in production.

`lib/games/ranking.ts` is the shared overall ranking calculation: total descending, correct Charades answers descending, Maze position ascending, Maze elapsed time ascending, then stable group ID. Missing Maze results sort after recorded ones. The live Charades board uses the same module to rank current-round points, correct answers and group ID. Gold, silver and bronze always follow ranks 1, 2 and 3.

To add a game, add its type, result source to `gaap_game_score_events`, lifecycle/action handling and renderer. The overall score columns and aggregation are already driven by the game's score map; no second independent total is stored.

## Verification record and boundaries

- `npm test`: 42 passing checks, including existing NFC/registration regression tests and the real SQL engine tests. DLSL calls in regression tests are mocked.
- `npm run test:games:http`: six passing checks against a disposable Next.js app: separate signed clients, actual HTTP authorization, concurrent finishes, retries, independent words, refresh, dependency failure/recovery and controlled deadline expiry.
- Browser checks: Maze submission and confirmation; admin undo followed by a new finish; end/start across screens; Charades correct/skip and refresh; correction history/dialog; deadline expiry with disabled actions; final ranking followed by waiting; desktop and phone scoreboards. An injected database outage displayed the connection warning while retaining scores; restoring the fixture removed the warning automatically with the same scores and no page reload. The 390-pixel phone layout shows both distinct answer buttons without horizontal overflow. Maze, Charades and the waiting leaderboard fit all 14 groups in the verified 1280×720 game display.
- Production builds use Webpack. The default Windows Turbopack build failed when its CSS worker exited before connecting, including after retry outside the sandbox; the supported Webpack build compiled and passed Next's type checking/static route generation. The package build command now uses that compiler.
- Lint has three pre-existing warnings in `app/dev/page.tsx` and `components/AccordionGallery.jsx`; game code has no lint errors. The isolated generated build directory is excluded from both Git and ESLint.
- The connected Supabase migration, Vercel deployment and physical event devices have not been verified. Apply the migration and perform an event rehearsal before using live scores.
- Concurrent HTTP submissions are exercised against PGlite, which serializes queries on its local connection. This is not a multi-session Supabase load test. Production protection is implemented in PostgreSQL transaction locks and uniqueness constraints.
- Synchronization uses polling, so other screens normally update within about two seconds, plus network time. Answers are never accepted based on a browser countdown alone. With every client closed, the stored state finalizes on the next authorized snapshot/action; its deadline still remains authoritative.
- Shared admin access audits session fingerprints rather than individual identities. Facilitator sessions expire after 12 hours and revoke when the group's code is rotated. Codes remain valid until replaced; keep them private.
- Groups referenced by game history cannot be deleted through registration management; its existing RPC reports that restriction and rolls back the attempted member deletion. Archive preserves history instead of purging it.
- Existing local edits to `components/SuccessCard.tsx` and `data.json` were left outside this implementation's commit. No `.env` contents or real participant data were added to it.

No additional questions were sent while the owner was away; the decisions above were applied as the suggested defaults.
