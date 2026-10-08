export type GameType = 'maze' | 'charades';
export type GameState = 'inactive' | 'ready' | 'running' | 'ended';
export type AttemptResult = 'correct' | 'skip';

export interface GameRound {
  id: string;
  number: number;
  state: 'pending' | 'running' | 'ended';
  startedAt: string | null;
  endAt: string | null;
  endedAt: string | null;
  endReason: string | null;
  configuration: { placements?: number[]; fallback?: number; durationSeconds?: number; correctPoints?: number; skipPoints?: number };
}
export interface Game {
  id: string;
  type: GameType;
  name: string;
  state: GameState;
  updatedAt: string;
  currentRound: GameRound | null;
}
export interface MazeFinish {
  id: string;
  position: number;
  elapsedMs: number;
  points: number;
  finishedAt: string;
}
export interface GameGroup {
  groupId: number;
  name: string;
  eligibleRounds: string[];
  maze: MazeFinish | null;
  charades: { correct: number; skipped: number; points: number; totalWords: number };
}
export interface ScoreRow {
  groupId: number;
  name: string;
  gameScores: Record<string, number>;
  totalScore: number;
  charadesCorrect: number;
  mazePosition: number | null;
  mazeElapsedMs: number | null;
  rank?: number;
}
export interface Word { id: string; text: string; sortOrder: number }
export interface CharadesAttempt {
  id: string; groupId: number; word: string; result: AttemptResult; points: number; attemptedAt: string;
}
export interface GameAudit {
  id: string; action: string; actor_label: string | null; created_at: string; before_data: unknown; after_data: unknown;
}
export interface GameSnapshot {
  serverNow: string;
  games: Game[];
  groups: GameGroup[];
  scoreboard: ScoreRow[];
  facilitator?: { groupId: number; currentWord: { id: string; word: string; position: number } | null };
  admin?: {
    maze: { placements: number[]; fallback: number };
    charades: { durationSeconds: number; correctPoints: number };
    words: Word[];
    facilitators: { groupId: number; updatedAt: string }[];
    attempts: CharadesAttempt[];
    audit: GameAudit[];
  };
}
export const GAME_LABELS: Record<GameType, string> = { maze: 'Maze Game', charades: 'Charades' };
export const STATE_LABELS: Record<GameState, string> = { inactive: 'Inactive', ready: 'Ready', running: 'Running', ended: 'Finished' };
