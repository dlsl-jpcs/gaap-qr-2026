'use client';
import { useState } from 'react';
import { Maximize2 } from 'lucide-react';
import GameHeader from '@/components/games/GameHeader';
import Leaderboard from '@/components/games/Leaderboard';
import styles from '@/components/games/game.module.css';
import { useGameFeed, useServerClock } from '@/lib/games/use-game-feed';
import { formatGameTime, gameTimeMs, ordinal } from '@/lib/games/timers';
import { podiumClass, rankCharades } from '@/lib/games/ranking';

export default function GameViewPage() {
  const feed = useGameFeed('/api/games/state');
  const serverNow = useServerClock(feed.offset);
  const [error, setError] = useState('');
  const snapshot = feed.snapshot;
  const running = snapshot?.games.find(game => game.state === 'running');
  const finalCharades = snapshot?.games.some(game => game.state === 'ready') ? undefined : snapshot?.games.find(game => game.type === 'charades' && game.state === 'ended' && game.currentRound?.endReason === 'timer' && serverNow - Date.parse(game.currentRound.endedAt || '') < 30000);
  const game = running || finalCharades;
  const time = game ? gameTimeMs(game, serverNow) : 0;
  const timeUp = game?.type === 'charades' && time <= 0;
  const ready = snapshot?.games.filter(item => item.state === 'ready').map(item => item.name).join(' / ');
  const groups = game?.type === 'charades' ? rankCharades((snapshot?.groups || []).filter(group => group.eligibleRounds.includes(game.currentRound?.id || ''))) : snapshot?.groups || [];
  const fullscreen = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); setError(''); }
    catch { setError('Use your browser’s fullscreen option to fill the display.'); }
  };
  return <main className={`${styles.page} ${styles.screen}`}>
    <GameHeader title="Game Board" />
    {feed.status === 'offline' && <p className={styles.error} role="status">{snapshot ? 'Connection lost. Showing the last received game state while reconnecting.' : 'Waiting for the game server. This screen will reconnect automatically.'}</p>}
    {game ? <>
      <section className={styles.hero} aria-label={`${game.name} timer`}>
        <div><h2>{timeUp ? "Time’s up" : game.name}</h2><p>{timeUp ? 'Final Charades rankings' : game.type === 'maze' ? 'Race to the finish' : 'Charades round ' + game.currentRound?.number}</p></div>
        <p className={styles.timer} aria-live="off">{formatGameTime(time, game.type === 'maze', game.type === 'charades')}</p>
      </section>
      <section className={styles.statusGrid} aria-label={`${game.name} group progress`}>
        {groups.map((group, index) => <article key={group.groupId} className={`${styles.teamCard} ${game.type === 'charades' ? styles[podiumClass(index + 1)] || '' : ''}`} data-finished={game.type === 'maze' && Boolean(group.maze)}>
          <h3>{group.name}</h3>
          {game.type === 'maze' ? group.maze ? <><div className={styles.finishLine}><strong>{ordinal(group.maze.position)}</strong><span>{formatGameTime(group.maze.elapsedMs)}</span></div><small>Finished · {group.maze.points} points</small></> : <p>{group.eligibleRounds.includes(game.currentRound?.id || '') ? 'Maze in progress' : 'Not in this round'}</p> : <>
            <div className={styles.finishLine}><span className={styles.rank} aria-label={`Rank ${index + 1}`}>{String(index + 1).padStart(2, '0')}</span><strong>{group.charades.points}</strong></div>
            <small>{group.charades.correct} correct</small>
          </>}
        </article>)}
        {groups.length === 0 && <p className={styles.empty}>No groups are in this round.</p>}
      </section>
    </> : <>
      <section className={styles.hero}><div><h2>{snapshot ? 'Waiting for the next game' : 'Loading game board…'}</h2>{ready && <p>{ready} is ready</p>}</div></section>
      {snapshot && <Leaderboard rows={snapshot.scoreboard} compact />}
    </>}
    <footer className={styles.displayFooter}><button className={styles.fullscreenButton} onClick={() => void fullscreen()} aria-label="Toggle fullscreen" title="Toggle fullscreen"><Maximize2 /></button></footer>
    {error && <p className={styles.error} role="status">{error}</p>}
  </main>;
}
