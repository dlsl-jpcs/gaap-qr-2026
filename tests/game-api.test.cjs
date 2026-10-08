/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { makeLoader } = require('./helpers/load-typescript.cjs');
const { createGameDb } = require('./helpers/game-db.cjs');
const { createRestDb } = require('./helpers/rest-db.cjs');

test('game routes authorize signed sessions and synchronize simulated clients with actual SQL', async t => {
  const engine = await createGameDb();
  const secretBefore = process.env.QR_GAAP_SESSION_SECRET;
  process.env.QR_GAAP_SESSION_SECRET = 'test-only-game-session-secret-at-least-32-characters';
  const rest = createRestDb(engine.db);
  const load = makeLoader({ '@/lib/supabase-rest': rest });
  const sessions = load('lib/games/session.ts');
  const adminSession = load('lib/admin-session.ts');
  const admin = load('app/api/admin/games/route.ts');
  const publicState = load('app/api/games/state/route.ts');
  const privateState = load('app/api/games/facilitator/route.ts');
  const maze = load('app/api/games/maze/finish/route.ts');
  const charades = load('app/api/games/charades/answer/route.ts');
  const cookies = [1, 2].map(group => sessions.FACILITATOR_COOKIE + '=' + sessions.createFacilitatorToken(group, engine.versions.get(group)).token);
  const adminCookie = adminSession.ADMIN_SESSION_COOKIE + '=' + adminSession.createAdminSessionToken().token;
  const request = (path, body, cookie = '', origin = 'http://localhost') => new Request('http://localhost' + path, { method: body ? 'POST' : 'GET', headers: { cookie, origin, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    await t.test('public/facilitator callers cannot mutate admin games; cross-origin requests fail', async () => {
      const body = { game: 'maze', action: 'prepare', payload: { expectedRoundId: null }, requestId: randomUUID() };
      assert.equal((await admin.POST(request('/api/admin/games', body))).status, 401);
      assert.equal((await admin.POST(request('/api/admin/games', body, cookies[0]))).status, 401);
      assert.equal((await admin.POST(request('/api/admin/games', body, adminCookie, 'https://attacker.invalid'))).status, 403);
      assert.equal((await maze.POST(request('/api/games/maze/finish', { roundId: randomUUID(), requestId: randomUUID() }))).status, 401);
    });
    await t.test('invalid inputs and tampered facilitator tokens never reach scoring', async () => {
      const payload = { roundId: randomUUID(), requestId: randomUUID() };
      assert.equal((await maze.POST(request('/api/games/maze/finish', { ...payload, groupId: 2 }, cookies[0]))).status, 403);
      assert.equal((await maze.POST(request('/api/games/maze/finish', { ...payload, roundId: 'bad' }, cookies[0]))).status, 400);
      assert.equal((await privateState.GET(request('/api/games/facilitator', null, cookies[0] + 'tampered'))).status, 401);
      const invalidConfig = { game: 'maze', action: 'settings', payload: { placements: [-1], fallback: 0 }, requestId: randomUUID() };
      assert.equal((await admin.POST(request('/api/admin/games', invalidConfig, adminCookie))).status, 400);
    });
    let round;
    await t.test('two facilitator clients record distinct Maze places; public clients read the same scores', async () => {
      round = await engine.start('maze');
      const body = { roundId: round.id, requestId: randomUUID() };
      const responses = await Promise.all([maze.POST(request('/api/games/maze/finish', body, cookies[0])), maze.POST(request('/api/games/maze/finish', { ...body, requestId: randomUUID() }, cookies[1]))]);
      assert.equal(responses.every(response => response.status === 200), true);
      const records = await Promise.all(responses.map(response => response.json()));
      assert.deepEqual(records.map(body => body.record.position).sort(), [1, 2]);
      assert.equal((await maze.POST(request('/api/games/maze/finish', body, cookies[0]))).status, 200);
      const [gameview, score] = await Promise.all([publicState.GET(), publicState.GET()]);
      const a = (await gameview.json()).snapshot, b = (await score.json()).snapshot;
      assert.deepEqual(a.scoreboard, b.scoreboard);
      assert.equal(a.scoreboard[0].totalScore, 100);
      assert.equal(a.scoreboard[1].totalScore, 90);
      assert.equal(a.facilitator, undefined);
      assert.equal(a.admin, undefined);
    });
    await t.test('Charades actions update every simulated display and a refreshed session keeps its deadline', async () => {
      await engine.transition('maze', 'end');
      await engine.command('charades', 'words', { words: ['ELEPHANT', 'PYRAMID'] });
      const charadesRound = await engine.start('charades');
      const own = (await (await privateState.GET(request('/api/games/facilitator', null, cookies[0]))).json()).snapshot;
      const word = own.facilitator.currentWord;
      const body = { roundId: charadesRound.id, wordId: word.id, result: 'correct', requestId: randomUUID() };
      const first = await charades.POST(request('/api/games/charades/answer', body, cookies[0]));
      assert.equal(first.status, 200);
      assert.equal((await charades.POST(request('/api/games/charades/answer', body, cookies[0]))).status, 200);
      const refreshed = (await (await privateState.GET(request('/api/games/facilitator', null, cookies[0]))).json()).snapshot;
      assert.equal(refreshed.facilitator.currentWord.word, 'PYRAMID');
      assert.equal(refreshed.games.find(g => g.type === 'charades').currentRound.endAt, charadesRound.endAt);
      const display = (await (await publicState.GET()).json()).snapshot;
      assert.equal(display.scoreboard.find(row => row.groupId === 1).gameScores.charades, 1);
      assert.equal(display.groups.find(row => row.groupId === 1).charades.correct, 1);
      assert.equal((await (await privateState.GET(request('/api/games/facilitator', null, cookies[1]))).json()).snapshot.facilitator.currentWord.word, 'ELEPHANT');
    });
    await t.test('code issuance retries are deterministic, hashes stay private, rotation revokes sessions', async () => {
      const requestId = randomUUID();
      const body = { game: 'maze', action: 'group_code', payload: { groupId: 1 }, requestId };
      const first = await (await admin.POST(request('/api/admin/games', body, adminCookie))).json();
      const second = await (await admin.POST(request('/api/admin/games', body, adminCookie))).json();
      assert.equal(first.success, true);
      assert.equal(second.code, first.code);
      assert.equal(first.code.length, 24);
      const stored = (await engine.db.query('select access_code_hash from facilitator_credentials where group_id = 1')).rows[0];
      assert.equal(stored.access_code_hash, sessions.hashAccessCode(first.code));
      assert.equal(await sessions.verifyFacilitatorCode(1, first.code), requestId);
      assert.equal((await privateState.GET(request('/api/games/facilitator', null, cookies[0]))).status, 401);
      const publicBody = await (await publicState.GET()).json();
      assert.equal(JSON.stringify(publicBody).includes(first.code), false);
      assert.equal(JSON.stringify(publicBody).includes(stored.access_code_hash), false);
    });
  } finally {
    if (secretBefore === undefined) delete process.env.QR_GAAP_SESSION_SECRET; else process.env.QR_GAAP_SESSION_SECRET = secretBefore;
    await engine.db.close();
  }
});
