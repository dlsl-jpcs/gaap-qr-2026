/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { createGameDb, migration } = require('./helpers/game-db.cjs');

test('actual PostgreSQL migration and game RPC integrity', async t => {
  const engine = await createGameDb();
  const { db, snapshot, command, transition, start, finish, answer, versions } = engine;
  try {
    await t.test('migration is repeatable and creates only definitions/configuration', async () => {
      await db.exec(migration);
      const state = await snapshot();
      assert.equal(state.games.length, 2);
      assert.equal(state.games.every(game => game.state === 'inactive'), true);
      assert.equal((await snapshot(null, true)).admin.charades.durationSeconds, 600);
      assert.equal((await db.query('select count(*)::int n from maze_results')).rows[0].n, 0);
    });
    await t.test('non-admin RPC actor and illegal transitions are rejected', async () => {
      assert.equal((await command('maze', 'prepare', { expectedRoundId: null }, randomUUID(), 'facilitator:1')).success, false);
      assert.equal((await transition('maze', 'start')).success, false);
      assert.equal((await transition('maze', 'end')).success, false);
    });
    let maze;
    await t.test('finishes before start are rejected; only one game can run', async () => {
      await transition('maze', 'prepare');
      const pending = (await snapshot()).games.find(g => g.type === 'maze').currentRound;
      assert.equal((await finish(pending.id, 1)).success, false);
      await transition('maze', 'start');
      maze = (await snapshot()).games.find(g => g.type === 'maze').currentRound;
      await command('charades', 'words', { words: ['ELEPHANT', 'COMPUTER', 'PYRAMID'] });
      await transition('charades', 'prepare');
      assert.equal((await transition('charades', 'start')).success, false);
      assert.equal((await transition('maze', 'start')).success, false);
      assert.equal((await command('maze', 'settings', { placements: [5], fallback: 0 })).success, false);
    });
    let first, firstRequest;
    await t.test('Maze placements, fallback, repeated requests and concurrent submissions', async () => {
      firstRequest = randomUUID();
      first = await finish(maze.id, 3, firstRequest);
      assert.equal(first.record.position, 1);
      assert.equal(first.record.points_awarded, 100);
      const responses = await Promise.all([finish(maze.id, 1), finish(maze.id, 2), finish(maze.id, 1)]);
      assert.deepEqual(responses.slice(0, 2).map(r => r.record.position).sort(), [2, 3]);
      const retry = await finish(maze.id, 3, firstRequest);
      assert.equal(retry.record.id, first.record.id);
      const newRequestSameGroup = await finish(maze.id, 3);
      assert.equal(newRequestSameGroup.record.id, first.record.id);
      assert.equal((await db.query('select count(*)::int n from maze_results')).rows[0].n, 3);
      assert.equal((await db.query('select gaap_placement_points($1,100) value', [{ placements: [100], fallback: 4 }])).rows[0].value, 4);
      assert.equal((await db.query('select gaap_placement_points($1,1) value', [{ placements: [-10], fallback: 0 }])).rows[0].value, 0);
      assert.equal((await finish(maze.id, 2, firstRequest)).success, false);
    });
    await t.test('Maze undo re-ranks points, audits values, and does not replay an undone request', async () => {
      const requestId = randomUUID();
      const payload = { resultId: first.record.id, reason: 'Pressed for wrong group' };
      assert.equal((await command('maze', 'maze_undo', payload, requestId)).success, true);
      assert.equal((await command('maze', 'maze_undo', payload, requestId)).success, true);
      const state = await snapshot();
      assert.equal(state.groups.find(g => g.groupId === 1).maze.position, 1);
      assert.equal(state.groups.find(g => g.groupId === 1).maze.points, 100);
      assert.equal(state.groups.find(g => g.groupId === 3).maze, null);
      await finish(maze.id, 3, firstRequest);
      assert.equal((await db.query('select count(*)::int n from maze_results')).rows[0].n, 2);
      assert.equal((await finish(maze.id, 3)).record.position, 3);
      assert.equal((await snapshot(null, true)).admin.audit.some(log => log.action === 'gaap.maze_undo' && log.before_data.removed.id === first.record.id), true);
    });
    await t.test('end preserves results and disallows new finishes', async () => {
      await transition('maze', 'end');
      assert.equal((await finish(maze.id, 4)).success, false);
      assert.equal((await db.query('select count(*)::int n from maze_results')).rows[0].n, 3);
    });
    let charades;
    await t.test('Charades uses exactly 600 seconds and frozen configuration/deck', async () => {
      await transition('charades', 'start');
      charades = (await snapshot()).games.find(g => g.type === 'charades').currentRound;
      assert.equal(Date.parse(charades.endAt) - Date.parse(charades.startedAt), 600000);
      assert.equal((await command('charades', 'words', { words: ['CHANGED'] })).success, false);
      assert.equal((await command('charades', 'settings', { durationSeconds: 300, correctPoints: 2 })).success, false);
      const a = await snapshot(1), b = await snapshot(2);
      assert.equal(a.facilitator.currentWord.word, 'ELEPHANT');
      assert.equal(b.facilitator.currentWord.word, 'ELEPHANT');
      assert.equal(a.games.find(g => g.type === 'charades').currentRound.endAt, b.games.find(g => g.type === 'charades').currentRound.endAt);
    });
    let attempt;
    await t.test('correct/skip, independent progress, duplicate prevention, and word exhaustion', async () => {
      const word = (await snapshot(1)).facilitator.currentWord;
      const requestId = randomUUID();
      const responses = await Promise.all([answer(charades.id, 1, word.id, 'correct', requestId), answer(charades.id, 1, word.id, 'correct')]);
      attempt = responses[0].record;
      assert.equal(attempt.points_awarded, 1);
      assert.equal(responses[1].record.id, attempt.id);
      assert.equal((await snapshot(1)).facilitator.currentWord.word, 'COMPUTER');
      assert.equal((await snapshot(2)).facilitator.currentWord.word, 'ELEPHANT');
      let next = (await snapshot(1)).facilitator.currentWord;
      assert.equal((await answer(charades.id, 1, next.id, 'skip')).record.points_awarded, 0);
      next = (await snapshot(1)).facilitator.currentWord;
      await answer(charades.id, 1, next.id, 'correct');
      const state = await snapshot(1);
      assert.equal(state.facilitator.currentWord, null);
      assert.equal(state.groups.find(g => g.groupId === 1).charades.correct, 2);
      assert.equal(state.groups.find(g => g.groupId === 1).charades.skipped, 1);
      assert.equal((await db.query('select count(*)::int n from charades_attempts where group_id = 1')).rows[0].n, 3);
      assert.equal((await answer(charades.id, 2, word.id, 'correct')).success, false);
      assert.equal((await answer(charades.id, 1, randomUUID(), 'correct')).success, false);
    });
    await t.test('admin corrections, adjustments and exact score aggregation', async () => {
      const payload = { attemptId: attempt.id, expectedResult: 'correct', result: 'skip', reason: 'Wrong button' };
      assert.equal((await command('charades', 'charades_correct', payload)).success, true);
      assert.equal((await command('charades', 'charades_correct', payload)).success, false);
      const requestId = randomUUID();
      const adjustment = { roundId: charades.id, groupId: 1, amount: 5, reason: 'Approved bonus' };
      await command('charades', 'adjust', adjustment, requestId);
      await command('charades', 'adjust', adjustment, requestId);
      const row = (await snapshot()).scoreboard.find(g => g.groupId === 1);
      assert.equal(row.gameScores.maze, 100);
      assert.equal(row.gameScores.charades, 6);
      assert.equal(row.totalScore, 106);
    });
    await t.test('expired deadline rejects new answers and finalizes the round', async () => {
      const word = (await snapshot(2)).facilitator.currentWord;
      await db.query("update game_rounds set deadline_at = clock_timestamp() - interval '1 second' where id = $1", [charades.id]);
      assert.equal((await answer(charades.id, 2, word.id, 'correct')).success, false);
      const game = (await snapshot()).games.find(g => g.type === 'charades');
      assert.equal(game.state, 'ended');
      assert.equal(game.currentRound.endReason, 'timer');
      assert.equal((await snapshot(2)).facilitator.currentWord, null);
    });
    await t.test('reset archives only the selected game and rejects stale round commands', async () => {
      await transition('maze', 'reset');
      const row = (await snapshot()).scoreboard.find(g => g.groupId === 1);
      assert.equal(row.gameScores.maze, 0);
      assert.equal(row.gameScores.charades, 6);
      assert.equal((await db.query('select count(*)::int n from maze_results')).rows[0].n, 3);
      const newRound = await start('maze');
      assert.notEqual(newRound.id, maze.id);
      assert.equal((await command('maze', 'end', { expectedRoundId: maze.id })).success, false);
      assert.equal((await finish(maze.id, 5)).success, false);
    });
    await t.test('group credential rotation is enforced independently by database', async () => {
      const round = (await snapshot()).games.find(g => g.type === 'maze').currentRound;
      await command('maze', 'group_code', { groupId: 7, hash: '1'.repeat(64), version: randomUUID() });
      assert.equal((await finish(round.id, 7)).status, 403);
      assert.notEqual((await db.query('select credential_version from facilitator_credentials where group_id = 7')).rows[0].credential_version, versions.get(7));
    });
    await t.test('public snapshots omit words/credentials; browser DB roles cannot mutate', async () => {
      const state = await snapshot();
      assert.equal(state.admin, undefined);
      assert.equal(state.facilitator, undefined);
      assert.equal(JSON.stringify(state).includes('word_snapshot'), false);
      assert.equal(JSON.stringify(state).includes('access_code_hash'), false);
      assert.equal((await db.query("select has_function_privilege('anon', 'public.gaap_admin_command(text,text,jsonb,uuid,text)', 'execute') allowed")).rows[0].allowed, false);
      assert.equal((await db.query("select has_table_privilege('authenticated', 'public.charades_words', 'select') allowed")).rows[0].allowed, false);
      assert.equal((await db.query("select has_table_privilege('anon', 'public.maze_results', 'insert') allowed")).rows[0].allowed, false);
    });
  } finally { await db.close(); }
});
