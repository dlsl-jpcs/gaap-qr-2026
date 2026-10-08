'use client';
import Link from 'next/link';
import GameHeader from '@/components/games/GameHeader';
import Leaderboard from '@/components/games/Leaderboard';
import styles from '@/components/games/game.module.css';
import { useGameFeed } from '@/lib/games/use-game-feed';

export default function ScorePage() {
  const feed = useGameFeed('/api/games/state');
  return <main className={styles.page}><div className={styles.container}>
    <GameHeader title="Scoreboard"><Link href="/games">Games</Link><Link href="/view">Groupings</Link></GameHeader>
    {feed.status === 'offline' && <p className={styles.error} role="status">{feed.snapshot ? 'Connection lost. Showing the last received scores while reconnecting.' : 'Waiting for the game server. This page will reconnect automatically.'}</p>}
    {!feed.snapshot ? <p className={styles.empty}>{feed.status === 'loading' ? 'Loading scores…' : 'Scores will appear when the connection returns.'}</p> : <Leaderboard rows={feed.snapshot.scoreboard} />}
  </div></main>;
}
