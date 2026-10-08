import type { GameGroup, ScoreRow } from './types';

/** All overall displays use this deterministic ranking, supplied by the API. */
export function rankScores(rows: ScoreRow[]): ScoreRow[] {
  return [...rows].sort((a, b) =>
    b.totalScore - a.totalScore ||
    b.charadesCorrect - a.charadesCorrect ||
    (a.mazePosition ?? Infinity) - (b.mazePosition ?? Infinity) ||
    (a.mazeElapsedMs ?? Infinity) - (b.mazeElapsedMs ?? Infinity) ||
    a.groupId - b.groupId,
  ).map((row, index) => ({ ...row, rank: index + 1 }));
}

export function rankCharades(groups: GameGroup[]): GameGroup[] {
  return [...groups].sort((a, b) => b.charades.points - a.charades.points || b.charades.correct - a.charades.correct || a.groupId - b.groupId);
}

export function podiumClass(rank: number) {
  return rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
}
