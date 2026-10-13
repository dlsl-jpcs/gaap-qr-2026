/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');

const migration = fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/202610080001_game_management.sql'), 'utf8');
async function createGameDb() {
  const db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  await db.exec(fs.readFileSync(path.resolve(__dirname, '../../supabase/schema.sql'), 'utf8'));
  await db.exec(migration);
  await db.exec(fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/202610130001_snapshot_lock_fast_path.sql'), 'utf8'));
  const versions = new Map();
  for (let groupId = 1; groupId <= 14; groupId++) {
    const version = randomUUID(); versions.set(groupId, version);
    await db.query('insert into facilitator_credentials(group_id,access_code_hash,credential_version) values($1,$2,$3)', [groupId, '0'.repeat(64), version]);
  }
  const snapshot = async (groupId = null, admin = false) => (await db.query('select gaap_game_snapshot($1,$2) as value', [groupId, admin])).rows[0].value;
  const command = async (game, action, payload = {}, requestId = randomUUID(), actor = 'admin:test-session') =>
    (await db.query('select gaap_admin_command($1,$2,$3,$4,$5) as value', [game, action, payload, requestId, actor])).rows[0].value;
  const transition = async (game, action) => {
    const state = (await snapshot()).games.find(item => item.type === game);
    return command(game, action, { expectedRoundId: state.currentRound?.id || null, ...(action === 'reset' ? { confirmed: true } : {}) });
  };
  const start = async game => { await transition(game, 'prepare'); await transition(game, 'start'); return (await snapshot()).games.find(item => item.type === game).currentRound; };
  const finish = async (roundId, groupId, requestId = randomUUID()) => (await db.query('select gaap_finish_maze($1,$2,$3,$4,$5) as value', [roundId, groupId, requestId, versions.get(groupId), 'facilitator:test-' + groupId])).rows[0].value;
  const answer = async (roundId, groupId, wordId, result, requestId = randomUUID()) => (await db.query('select gaap_charades_answer($1,$2,$3,$4,$5,$6,$7) as value', [roundId, groupId, wordId, result, requestId, versions.get(groupId), 'facilitator:test-' + groupId])).rows[0].value;
  return { db, versions, snapshot, command, transition, start, finish, answer };
}
module.exports = { createGameDb, migration };
