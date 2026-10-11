'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Circle } from 'lucide-react';
import GameHeader from '@/components/games/GameHeader';
import ConfirmDialog from '@/components/games/ConfirmDialog';
import styles from '@/components/games/game.module.css';
import { postGameAction, useGameFeed, useServerClock } from '@/lib/games/use-game-feed';
import { formatGameTime, gameTimeMs, ordinal } from '@/lib/games/timers';
import { STATE_LABELS, type GameType } from '@/lib/games/types';

export default function GamesPage() {
  const privateFeed = useGameFeed('/api/games/facilitator');
  const publicFeed = useGameFeed('/api/games/state', !privateFeed.snapshot);
  const snapshot = privateFeed.snapshot || publicFeed.snapshot;
  const serverNow = useServerClock(privateFeed.snapshot ? privateFeed.offset : publicFeed.offset);
  const [selectedGame, setSelectedGame] = useState<GameType | null>(null);
  const [groupId, setGroupId] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeRound, setNoticeRound] = useState<string | undefined>();
  const [changingGroup, setChangingGroup] = useState(false);
  const [confirmedAction, setConfirmedAction] = useState('');
  const [deactivatedGame, setDeactivatedGame] = useState('');
  const request = useRef<{ key: string; id: string } | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const saved = sessionStorage.getItem('qr_gaap_selected_game');
        if (saved === 'maze' || saved === 'charades') setSelectedGame(saved);
      } catch { /* Storage can be disabled; the group session still lives in a cookie. */ }
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (!deactivatedGame) return;
    try { sessionStorage.removeItem('qr_gaap_selected_game'); } catch {}
  }, [deactivatedGame]);
  const chooseGame = (type: GameType) => {
    setSelectedGame(type); setError(''); setNotice(''); setDeactivatedGame('');
    try { sessionStorage.setItem('qr_gaap_selected_game', type); } catch {}
  };
  const currentGame = snapshot?.games.find(game => game.type === selectedGame);
  // When the admin deactivates the selected game, leave it and tell the facilitator why.
  if (selectedGame && currentGame?.state === 'inactive') {
    setDeactivatedGame(currentGame.name);
    setSelectedGame(null);
    setNotice('');
    setError('');
    setCode('');
    setGroupId('');
    setConfirmedAction('');
  }
  const controlledGroup = snapshot?.groups.find(group => group.groupId === privateFeed.snapshot?.facilitator?.groupId);
  const word = privateFeed.snapshot?.facilitator?.currentWord;
  const time = currentGame ? gameTimeMs(currentGame, serverNow) : 0;
  const timeUp = currentGame?.type === 'charades' && Boolean(currentGame.currentRound?.startedAt) && time <= 0;
  const roundId = currentGame?.currentRound?.id;
  const eligible = Boolean(roundId && controlledGroup?.eligibleRounds.includes(roundId));
  const actionKey = selectedGame === 'maze' ? `maze:${roundId}:${controlledGroup?.groupId}` : `charades:${roundId}:${controlledGroup?.groupId}:${word?.id}`;
  const canAct = !busy && privateFeed.status === 'live' && currentGame?.state === 'running' && eligible && !timeUp && confirmedAction !== actionKey;

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      await postGameAction('/api/games/session', { groupId: Number(groupId), code });
      setCode(''); await privateFeed.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to open this group.'); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const changeGroup = async () => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const response = await fetch('/api/games/session', { method: 'DELETE' });
      if (!response.ok) throw new Error('Unable to change group. Please try again.');
      await privateFeed.refresh(); setChangingGroup(false); setGroupId(''); setNotice('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to change group.'); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const score = async (result?: 'correct' | 'skip') => {
    if (inFlight.current || !canAct || !roundId || !controlledGroup) return;
    inFlight.current = true; setBusy(true); setError(''); setNotice('');
    const key = actionKey + ':' + (result || 'finish');
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
    try {
      await postGameAction(selectedGame === 'maze' ? '/api/games/maze/finish' : '/api/games/charades/answer', {
        roundId, requestId: request.current.id, ...(result ? { wordId: word?.id, result } : {}),
      });
      // Maze is locked by its authoritative result; an admin undo can unlock it.
      if (selectedGame === 'maze') request.current = null;
      else setConfirmedAction(actionKey);
      setNoticeRound(roundId);
      setNotice(selectedGame === 'maze' ? 'Finish recorded.' : result === 'correct' ? 'Correct answer recorded.' : 'Skip recorded.');
      await privateFeed.refresh();
    } catch (e) {
      setError(e instanceof Error && e.name !== 'TimeoutError' ? e.message : 'The connection timed out. Check the current result, then retry if needed.');
      await privateFeed.refresh();
    } finally { inFlight.current = false; setBusy(false); }
  };

  return <main className={styles.page}><div className={styles.facilitator}>
    <GameHeader title="Games"><Link href="/score">Scoreboard</Link></GameHeader>
    {publicFeed.status === 'offline' && !snapshot && <p className={styles.error} role="alert">{publicFeed.error}</p>}
    {!snapshot && publicFeed.status === 'loading' && <p className={styles.empty}>Loading games…</p>}
    <div className={styles.gameCards} data-compact={Boolean(controlledGroup)}>
      {snapshot?.games.map(game => <button key={game.id} className={styles.gameCard} disabled={busy || game.state === 'inactive'} aria-pressed={selectedGame === game.type} onClick={() => chooseGame(game.type)}>
        <strong>{game.name}</strong><span className={styles.status} data-state={game.state}>{STATE_LABELS[game.state]}</span>
      </button>)}
    </div>
    {deactivatedGame && !selectedGame && <p className={styles.notice} role="alert"><strong>{deactivatedGame} was deactivated by the admin.</strong> Scoring has stopped. Wait for the admin to prepare a game again, then choose it to continue.</p>}
    {!selectedGame && snapshot && <p className={styles.empty}>{snapshot.games.some(game => game.state !== 'inactive') ? 'Choose a game to continue.' : 'Waiting for the admin to prepare a game.'}</p>}
    {selectedGame && !controlledGroup && <section className={styles.frame}>
      <h2 className={styles.sectionTitle}>Choose your group</h2>
      <p className={styles.muted}>Enter the facilitator PIN provided by the admin.</p>
      <form className={styles.form} onSubmit={login}>
        <label>Group<select className={styles.input} value={groupId} onChange={event => setGroupId(event.target.value)} required disabled={busy}>
          <option value="">Select a group</option>{snapshot?.groups.map(group => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}
        </select></label>
        <label>Facilitator PIN<input className={styles.input} type="password" autoComplete="current-password" value={code} onChange={event => setCode(event.target.value)} maxLength={128} required disabled={busy} /></label>
        <button className={styles.button} disabled={busy || !snapshot?.groups.length}>{busy ? 'Opening group…' : 'Continue'}</button>
      </form>
      {snapshot?.groups.length === 0 && <p className={styles.notice}>No groups are available. Ask the admin to create them.</p>}
    </section>}
    {controlledGroup && currentGame && <section className={`${styles.frame} ${styles.playFrame}`}>
      <div className={styles.groupBanner}><div><small>You are facilitating</small><h2>{controlledGroup.name}</h2></div>
        <button className={styles.textButton} disabled={busy} onClick={() => setChangingGroup(true)}>Change Group</button>
      </div>
      {privateFeed.status !== 'live' && <p className={styles.error} role="alert">Connection lost. Actions are paused while the page reconnects.</p>}
      {currentGame.state === 'inactive' || currentGame.state === 'ready' ? <p className={styles.empty}>{currentGame.state === 'ready' ? 'Ready. Waiting for the admin to start.' : 'This game is inactive.'}</p> : <>
        {currentGame.type === 'maze' ? controlledGroup.maze ? <div className={styles.finished}>
          <h3>Finished</h3><div className={styles.metrics}><div><strong>{ordinal(controlledGroup.maze.position)}</strong><span>Position</span></div><div><strong>{formatGameTime(controlledGroup.maze.elapsedMs)}</strong><span>Time</span></div><div><strong>+{controlledGroup.maze.points}</strong><span>Points</span></div></div>
        </div> : <>
          <div className={styles.playTimer}><p className={styles.timerLabel}>Maze time</p><p className={styles.timer}>{formatGameTime(time, true)}</p></div>
          {currentGame.state === 'ended' ? <p className={styles.empty}>Maze has ended. No finish was recorded for this group.</p> : !eligible ? <p className={styles.empty}>This group is not part of this round. Contact the admin.</p> : <button className={styles.buzzer} disabled={!canAct} onClick={() => void score()}>{busy ? 'Recording finish…' : confirmedAction === actionKey ? 'Finish recorded' : 'Finished Maze'}</button>}
        </> : <>
          <div className={styles.playTimer}><p className={styles.timerLabel}>Time remaining</p><p className={styles.timer}>{formatGameTime(time, false, true)}</p></div>
          {timeUp || currentGame.state === 'ended' ? <div className={styles.finished}><h3>{timeUp ? "Time’s up" : 'Round finished'}</h3></div> : !eligible ? <p className={styles.empty}>This group is not part of this round. Contact the admin.</p> : word ? <>
            <p className={styles.word}>{word.word}</p>
            <div className={styles.answerButtons}>
              <button className={`${styles.answer} ${styles.correct}`} disabled={!canAct} onClick={() => void score('correct')}><Check aria-hidden="true" /><span>Correct</span></button>
              <button className={`${styles.answer} ${styles.skip}`} disabled={!canAct} onClick={() => void score('skip')}><Circle aria-hidden="true" /><span>Skip</span></button>
            </div>
          </> : <p className={styles.empty}>All words have been attempted. Your score is saved.</p>}
          <div className={styles.metrics}><div><strong>{controlledGroup.charades.correct}</strong><span>Correct</span></div><div><strong>{controlledGroup.charades.skipped}</strong><span>Skipped</span></div><div><strong>{controlledGroup.charades.points}</strong><span>Points</span></div></div>
        </>}
      </>}
    </section>}
    {busy && controlledGroup && selectedGame === 'charades' && <p className={styles.notice} role="status">Recording answer…</p>}
    {notice && noticeRound === roundId && <p className={styles.notice} role="status">{notice}</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <ConfirmDialog open={changingGroup} title="Change facilitator group?" confirmLabel="Change Group" busy={busy} onConfirm={() => void changeGroup()} onClose={() => setChangingGroup(false)}>
      <p>You are currently handling {controlledGroup?.name}. You will need the new group’s facilitator code to continue.</p>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </ConfirmDialog>
  </div></main>;
}
