import type { ScoreRow } from '@/lib/games/types';
import type { CSSProperties } from 'react';
import { podiumClass } from '@/lib/games/ranking';
import styles from './game.module.css';
export default function Leaderboard({ rows, compact = false }: { rows: ScoreRow[]; compact?: boolean }) {
  const gameColumns = Object.keys(rows[0]?.gameScores || { maze: 0, charades: 0 });
  const labels: Record<string, string> = { maze: 'Maze', charades: 'Charades' };
  return <div className={`${styles.leaderboard} ${compact ? styles.compact : ''}`} style={{ '--score-columns': gameColumns.length + 1 } as CSSProperties}>
    <table>
      <caption className="sr-only">Overall group ranking, ordered by total points and the shared tie breakers</caption>
      <thead><tr><th scope="col">Rank</th><th scope="col">Group</th>{gameColumns.map(type => <th key={type} scope="col">{labels[type] || type}</th>)}<th scope="col">Total</th></tr></thead>
      <tbody>{rows.map((row, index) => {
        const rank = row.rank ?? index + 1;
        return <tr key={row.groupId} className={styles[podiumClass(rank)] || undefined}>
          <td className={styles.rankCell}><span aria-label={`Rank ${rank}`} className={styles.rank}>{String(rank).padStart(2, '0')}</span></td>
          <th scope="row" className={styles.groupName}>{row.name}</th>
          {gameColumns.map(type => <td key={type} data-label={labels[type] || type}>{row.gameScores[type] ?? 0}</td>)}
          <td data-label="Total" className={styles.total}>{row.totalScore}</td>
        </tr>;
      })}</tbody>
    </table>
    {rows.length === 0 && <p className={styles.empty}>Groups will appear after the admin creates them.</p>}
  </div>;
}
