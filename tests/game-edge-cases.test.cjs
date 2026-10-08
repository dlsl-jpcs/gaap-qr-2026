/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createGameDb, migration } = require('./helpers/game-db.cjs');

test('configuration conflicts and paginated correction history use authoritative records', async t => {
  const { db, snapshot, command, transition, start, answer, finish } = await createGameDb();
  try {
    await t.test('two stale admin drafts cannot overwrite each other; audit captures old settings', async () => {
      const version = (await snapshot()).games.find(g => g.type === 'maze').updatedAt;
      const payload = { placements: [12, 8], fallback: 2, expectedVersion: version };
      assert.equal((await command('maze', 'settings', payload)).success, true);
      assert.equal((await command('maze', 'settings', { ...payload, placements: [99] })).status, 409);
      const audit = (await snapshot(null, true)).admin.audit.find(log => log.action === 'gaap.settings');
      assert.equal(audit.before_data.placements[0], 100);
      assert.equal(audit.after_data.placements[0], 12);
      await db.exec(migration);
      assert.deepEqual((await snapshot(null, true)).admin.maze.placements, [12, 8]);
    });
    await t.test('invalid settings, duplicate/empty words, empty decks and unconfirmed reset are rejected', async () => {
      assert.equal((await command('maze', 'settings', { placements: [-1], fallback: 0 })).success, false);
      assert.equal((await command('charades', 'settings', { durationSeconds: 0, correctPoints: 1 })).success, false);
      assert.equal((await command('charades', 'words', { words: [' Same ', 'same'] })).success, false);
      assert.equal((await command('charades', 'words', { words: [''] })).success, false);
      await transition('charades', 'prepare');
      assert.equal((await transition('charades', 'start')).success, false);
      const pending = (await snapshot()).games.find(g => g.type === 'charades').currentRound;
      assert.equal((await command('charades', 'reset', { expectedRoundId: pending.id })).success, false);
      await transition('charades', 'reset');
    });
    await t.test('group eligibility is frozen and word management preserves ordering and conflicts', async () => {
      await db.query('delete from facilitator_credentials where group_id=14');
      await db.query('delete from groups where id=14');
      const maze = await start('maze');
      await db.query("insert into groups(id,name,capacity) values(14,'Late Group',20)");
      const state = await snapshot();
      assert.deepEqual(state.groups.find(group => group.groupId === 14).eligibleRounds, []);
      assert.equal((await finish(maze.id, 1)).record.points_awarded, 12);
      await transition('maze', 'end');
      const version = (await snapshot()).games.find(g => g.type === 'charades').updatedAt;
      assert.equal((await command('charades', 'words', { words: ['THIRD', 'FIRST', 'SECOND'], expectedVersion: version })).success, true);
      assert.equal((await command('charades', 'words', { words: ['STALE'], expectedVersion: version })).status, 409);
      assert.deepEqual((await snapshot(null, true)).admin.words.map(word => word.text), ['THIRD', 'FIRST', 'SECOND']);
    });
    await t.test('all attempts can be reviewed without pagination duplicates, including tied timestamps', async () => {
      await command('charades', 'words', { words: Array.from({ length: 52 }, (_, index) => 'WORD ' + index) });
      const round = await start('charades');
      const words = (await db.query('select id from charades_round_words where round_id=$1 and group_id=1 order by deck_position', [round.id])).rows;
      for (const word of words) assert.equal((await answer(round.id, 1, word.id, 'correct')).success, true);
      await db.query('update charades_attempts set attempted_at=$1 where round_id=$2', [round.startedAt, round.id]);
      const page = (await db.query('select gaap_charades_history(1) value')).rows[0].value;
      assert.equal(page.attempts.length, 50);
      assert.ok(page.cursor);
      const next = (await db.query('select gaap_charades_history(1,$1,$2) value', [page.cursor.at, page.cursor.id])).rows[0].value;
      assert.equal(next.attempts.length, 2);
      assert.equal(next.cursor, null);
      assert.equal(new Set([...page.attempts, ...next.attempts].map(row => row.id)).size, 52);
      assert.equal((await snapshot(1)).facilitator.currentWord, null);
      assert.equal((await snapshot()).scoreboard.find(group => group.groupId === 1).gameScores.charades, 52);
    });
  } finally { await db.close(); }
});
