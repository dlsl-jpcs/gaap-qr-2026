import type { GameType } from './types';
import { GameRequestError, requireUuid } from './server';

function integer(value: unknown, min: number, max: number) {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}
export function validateAdminPayload(game: GameType, action: string, payload: Record<string, unknown>) {
  if (['settings', 'words'].includes(action) && payload.expectedVersion !== undefined && (typeof payload.expectedVersion !== 'string' || !Number.isFinite(Date.parse(payload.expectedVersion)))) throw new GameRequestError('Invalid settings version. Reload before saving.');
  if (action === 'reset' && payload.confirmed !== true) throw new GameRequestError('Confirm the reset before continuing.');
  if (action === 'settings') {
    if (game === 'maze') {
      if (!Array.isArray(payload.placements) || payload.placements.length < 1 || payload.placements.length > 100 || payload.placements.some(value => !integer(value, 0, 100000)) || !integer(payload.fallback, 0, 100000)) throw new GameRequestError('Enter nonnegative whole-number placement and fallback points.');
    } else if (!integer(payload.durationSeconds, 10, 7200) || !integer(payload.correctPoints, 0, 100000)) throw new GameRequestError('Enter a duration of 10–7200 seconds and nonnegative correct-answer points.');
  }
  if (action === 'words') {
    if (game !== 'charades' || !Array.isArray(payload.words) || payload.words.length > 1000 || payload.words.some(word => typeof word !== 'string' || !word.trim() || word.trim().length > 100)) throw new GameRequestError('Enter at most 1000 nonblank words of 100 characters or fewer.');
    const words = (payload.words as string[]).map(word => word.trim().toLowerCase());
    if (new Set(words).size !== words.length) throw new GameRequestError('Remove duplicate words before saving.');
  }
  if (['maze_undo', 'charades_correct', 'adjust'].includes(action) && (typeof payload.reason !== 'string' || !payload.reason.trim() || payload.reason.trim().length > 300)) throw new GameRequestError('A reason of 1–300 characters is required.');
  if (action === 'charades_correct' && (game !== 'charades' || !['correct', 'skip'].includes(String(payload.result)) || !['correct', 'skip'].includes(String(payload.expectedResult)))) throw new GameRequestError('Choose a valid Charades outcome.');
  if (action === 'maze_undo' && game !== 'maze') throw new GameRequestError('This correction applies to Maze.');
  if (action === 'adjust') {
    requireUuid(payload.roundId, 'adjustment round');
    if (!integer(payload.amount, -10000, 10000) || payload.amount === 0) throw new GameRequestError('Enter a nonzero whole-number adjustment within ±10000.');
  }
}
