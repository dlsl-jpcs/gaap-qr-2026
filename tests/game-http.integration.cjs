/* eslint-disable @typescript-eslint/no-require-imports */
// Run only with npm run preview:games. Fixed localhost ports and a fixture hash
// guard prevent this test from modifying a real Supabase project.
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { test } = require('node:test');
const base = 'http://127.0.0.1:3022';
const fixture = 'http://127.0.0.1:3033/rest/v1/';

test('real Next HTTP routes synchronize separate signed clients against the isolated fixture', async t => {
  const guard = await fetch(fixture + 'facilitator_credentials?group_id=eq.2&select=access_code_hash', { headers: { apikey: 'isolated-preview-key' } });
  assert.equal(guard.status, 200, 'Start the isolated preview before running this integration test.');
  assert.equal((await guard.json())[0].access_code_hash, createHash('sha256').update('preview-group-2').digest('hex'));
  const call = async (path, payload, cookie = '', origin = base) => {
    const response = await fetch(base + path, { method: payload ? 'POST' : 'GET', headers: { origin, cookie, 'Content-Type': 'application/json' }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
    return { response, body: await response.json() };
  };
  const login = async payload => {
    const result = await call(payload.password ? '/api/admin/session' : '/api/games/session', payload);
    assert.equal(result.response.status, 200);
    return result.response.headers.get('set-cookie').split(';')[0];
  };
  const admin = await login({ password: 'preview-password-only' });
  const cookies = await Promise.all([2, 3].map(groupId => login({ groupId, code: 'preview-group-' + groupId })));
  const state = async (cookie = '') => (await call(cookie ? '/api/games/facilitator' : '/api/games/state', null, cookie)).body.snapshot;
  const command = async (game, action, payload) => call('/api/admin/games', { game, action, payload, requestId: randomUUID() }, admin);
  const transition = async (game, action) => {
    const current = (await state()).games.find(item => item.type === game);
    const result = await command(game, action, { expectedRoundId: current.currentRound?.id || null, ...(action === 'reset' ? { confirmed: true } : {}) });
    assert.equal(result.response.status, 200, result.body.message);
  };
  for (const game of (await state()).games) await transition(game.type, 'reset');
  await t.test('unauthorized, wrong-group, and cross-origin requests are rejected', async () => {
    assert.equal((await call('/api/admin/games')).response.status, 401);
    assert.equal((await call('/api/games/session', { groupId: 3, code: 'preview-group-2' })).response.status, 401);
    assert.equal((await call('/api/admin/games', { game: 'maze', action: 'prepare', payload: { expectedRoundId: null }, requestId: randomUUID() }, admin, 'https://attacker.invalid')).response.status, 403);
  });
  let round;
  await t.test('simultaneous HTTP finishes get distinct positions and retries add no score', async () => {
    await transition('maze', 'prepare'); await transition('maze', 'start');
    round = (await state()).games.find(game => game.type === 'maze').currentRound;
    const first = { roundId: round.id, requestId: randomUUID() };
    const finishes = await Promise.all(cookies.map((cookie, index) => call('/api/games/maze/finish', index ? { ...first, requestId: randomUUID() } : first, cookie)));
    assert.equal(finishes.every(result => result.response.status === 200), true);
    assert.deepEqual(finishes.map(result => result.body.record.position).sort(), [1, 2]);
    const retry = await call('/api/games/maze/finish', first, cookies[0]);
    assert.equal(retry.body.record.id, finishes[0].body.record.id);
    const publicState = await state();
    assert.equal(publicState.scoreboard.reduce((sum, row) => sum + row.gameScores.maze, 0), 190);
    assert.equal(publicState.admin, undefined); assert.equal(publicState.facilitator, undefined);
    await transition('maze', 'end');
  });
  await t.test('Charades correct/skip, independent decks and refresh preserve the global deadline', async () => {
    assert.equal((await command('charades', 'words', { words: ['ELEPHANT', 'COMPUTER', 'PYRAMID'] })).response.status, 200);
    await transition('charades', 'prepare'); await transition('charades', 'start');
    const before = await state(cookies[0]);
    round = before.games.find(game => game.type === 'charades').currentRound;
    assert.equal(Date.parse(round.endAt) - Date.parse(round.startedAt), 600000);
    const correct = { roundId: round.id, wordId: before.facilitator.currentWord.id, result: 'correct', requestId: randomUUID() };
    assert.equal((await call('/api/games/charades/answer', correct, cookies[0])).response.status, 200);
    assert.equal((await call('/api/games/charades/answer', correct, cookies[0])).response.status, 200);
    const next = await state(cookies[0]), other = await state(cookies[1]);
    assert.equal(next.facilitator.currentWord.word, 'COMPUTER');
    assert.equal(other.facilitator.currentWord.word, 'ELEPHANT');
    assert.equal(next.games.find(game => game.type === 'charades').currentRound.endAt, round.endAt);
    const skip = { roundId: round.id, wordId: next.facilitator.currentWord.id, result: 'skip', requestId: randomUUID() };
    assert.equal((await call('/api/games/charades/answer', skip, cookies[0])).response.status, 200);
    const score = (await state()).scoreboard.find(row => row.groupId === 2);
    assert.equal(score.gameScores.charades, 1); assert.equal(score.charadesCorrect, 1);
  });
  await t.test('dependency failure returns 503 and recovery returns the same deadline and scores', async () => {
    const availability = unavailable => fetch('http://127.0.0.1:3033/__fixture/availability', { method: 'POST', headers: { apikey: 'isolated-preview-key', 'Content-Type': 'application/json' }, body: JSON.stringify({ unavailable }) });
    try {
      assert.equal((await availability(true)).status, 200);
      const failed = await call('/api/games/state');
      assert.equal(failed.response.status, 503);
      assert.equal(failed.body.success, false);
      assert.equal(failed.body.message.includes('Injected'), false);
    } finally { await availability(false); }
    const recovered = await state();
    assert.equal(recovered.games.find(game => game.type === 'charades').currentRound.endAt, round.endAt);
    assert.equal(recovered.scoreboard.find(row => row.groupId === 2).gameScores.charades, 1);
  });
  await t.test('a controlled fixture expiry rejects late HTTP answers and freezes the final scores', async () => {
    const own = await state(cookies[1]);
    const late = { roundId: round.id, wordId: own.facilitator.currentWord.id, result: 'correct', requestId: randomUUID() };
    const expiry = await fetch(fixture + 'game_rounds?id=eq.' + round.id, { method: 'PATCH', headers: { apikey: 'isolated-preview-key', 'Content-Type': 'application/json' }, body: JSON.stringify({ deadline_at: new Date(Date.now() - 100).toISOString() }) });
    assert.equal(expiry.status, 200);
    assert.equal((await call('/api/games/charades/answer', late, cookies[1])).response.status, 409);
    const final = await state();
    assert.equal(final.games.find(game => game.type === 'charades').state, 'ended');
    assert.equal(final.games.find(game => game.type === 'charades').currentRound.endReason, 'timer');
    assert.equal(final.scoreboard.find(row => row.groupId === 3).gameScores.charades, 0);
  });
});
