/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { makeLoader } = require('./helpers/load-typescript.cjs');
const load = makeLoader();
const { rankScores, rankCharades, podiumClass } = load('lib/games/ranking.ts');
const { gameTimeMs, clockOffset, formatGameTime, ordinal } = load('lib/games/timers.ts');
const { requireSameOrigin } = load('lib/games/server.ts');

test('origin validation accepts the public Host through Next and rejects cross-site callers', () => {
  const request = headers => new Request('http://localhost:3022/api/games/session', { headers });
  assert.doesNotThrow(() => requireSameOrigin(request({ host: '127.0.0.1:3022', origin: 'http://127.0.0.1:3022' })));
  assert.doesNotThrow(() => requireSameOrigin(request({ host: 'event.example.com', origin: 'https://event.example.com', 'x-forwarded-proto': 'https' })));
  assert.throws(() => requireSameOrigin(request({ host: 'event.example.com', origin: 'https://attacker.example.com', 'x-forwarded-proto': 'https', 'x-forwarded-host': 'attacker.example.com' })), /origin/);
  assert.throws(() => requireSameOrigin(request({ host: '127.0.0.1:3022', origin: 'http://127.0.0.1:3022', 'sec-fetch-site': 'cross-site' })), /origin/);
});

test('overall ranking applies every tie breaker once and does not mutate inputs', () => {
  const row = (groupId, overrides = {}) => ({ groupId, name: 'Group ' + groupId, gameScores: { maze: 90, charades: 10 }, totalScore: 100, charadesCorrect: 10, mazePosition: 2, mazeElapsedMs: 1000, ...overrides });
  const rows = [row(8), row(7), row(6, { mazeElapsedMs: 900 }), row(5, { mazePosition: 1 }), row(4, { charadesCorrect: 11 }), row(3, { totalScore: 101 }), row(9, { mazePosition: null }), row(10, { mazeElapsedMs: null })];
  assert.deepEqual(rankScores(rows).map(row => row.groupId), [3, 4, 5, 6, 7, 8, 10, 9]);
  assert.equal(rows[0].rank, undefined);
  assert.deepEqual(rankScores(rows).map(row => row.rank), [1,2,3,4,5,6,7,8]);
  assert.deepEqual([1, 2, 3, 4].map(podiumClass), ['gold', 'silver', 'bronze', '']);
});
test('Charades ranking represents current-round points, correct answers, then group ID', () => {
  const groups = [{ groupId: 3, charades: { points: 5, correct: 3 } }, { groupId: 2, charades: { points: 5, correct: 4 } }, { groupId: 1, charades: { points: 5, correct: 4 } }];
  assert.deepEqual(rankCharades(groups).map(group => group.groupId), [1, 2, 3]);
});
test('timers reconstruct from timestamps across refresh, compensate clock offset and clamp expiry', () => {
  const round = { startedAt: '2026-10-08T00:00:00.000Z', endAt: '2026-10-08T00:10:00.000Z', endedAt: null };
  const game = { type: 'charades', state: 'running', currentRound: round };
  const now = Date.parse('2026-10-08T00:05:28.000Z');
  assert.equal(gameTimeMs(game, now), 272000);
  assert.equal(formatGameTime(gameTimeMs(structuredClone(game), now), false, true), '04:32');
  assert.equal(gameTimeMs(game, now + 600000), 0);
  assert.equal(gameTimeMs({ ...game, type: 'maze' }, now), 328000);
  assert.equal(formatGameTime(462000, true), '00:07:42');
  assert.equal(formatGameTime(999, false, true), '00:01');
  assert.equal(formatGameTime(999), '00:00');
  assert.equal(clockOffset(new Date(11000).toISOString(), 9500, 10500), 1000);
  assert.deepEqual([1,2,3,4,11,12,13,21].map(ordinal), ['1st','2nd','3rd','4th','11th','12th','13th','21st']);
});
