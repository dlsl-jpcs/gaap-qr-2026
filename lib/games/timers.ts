import type { Game } from './types';

export function clockOffset(serverNow: string, requestStartedAt: number, responseAt: number) {
  return Date.parse(serverNow) - (requestStartedAt + responseAt) / 2;
}

export function gameTimeMs(game: Game, serverNow: number) {
  const round = game.currentRound;
  if (!round?.startedAt) return game.type === 'charades' ? (round?.configuration.durationSeconds ?? 600) * 1000 : 0;
  const effectiveNow = game.state === 'ended' && round.endedAt ? Date.parse(round.endedAt) : serverNow;
  return game.type === 'charades'
    ? Math.max(0, Date.parse(round.endAt || round.startedAt) - effectiveNow)
    : Math.max(0, effectiveNow - Date.parse(round.startedAt));
}

export function formatGameTime(milliseconds: number, includeHours = false, countdown = false) {
  const seconds = Math.max(0, countdown ? Math.ceil(milliseconds / 1000) : Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  const value = (n: number) => String(n).padStart(2, '0');
  return includeHours
    ? `${value(Math.floor(seconds / 3600))}:${value(Math.floor(minutes % 60))}:${value(seconds % 60)}`
    : `${value(minutes)}:${value(seconds % 60)}`;
}

export function ordinal(position: number) {
  const remainder = position % 100;
  const suffix = remainder >= 11 && remainder <= 13 ? 'th' : position % 10 === 1 ? 'st' : position % 10 === 2 ? 'nd' : position % 10 === 3 ? 'rd' : 'th';
  return `${position}${suffix}`;
}
