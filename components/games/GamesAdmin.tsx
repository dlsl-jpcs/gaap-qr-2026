'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from 'lucide-react';
import { postGameAction, useGameFeed, useServerClock } from '@/lib/games/use-game-feed';
import { formatGameTime, gameTimeMs, ordinal } from '@/lib/games/timers';
import { STATE_LABELS, type CharadesAttempt, type Game, type GameType } from '@/lib/games/types';
import Leaderboard from './Leaderboard';
import ConfirmDialog from './ConfirmDialog';
import styles from './game.module.css';

type Confirmation = { game: GameType; action: string; payload: Record<string, unknown>; title: string; message: string; label: string; needsReason?: boolean };
type History = { attempts: CharadesAttempt[]; cursor: { at: string; id: string } | null; roundId: string | null };

export default function GamesAdmin() {
  const feed = useGameFeed('/api/admin/games');
  const now = useServerClock(feed.offset);
  const [busy, setBusy] = useState(false);
  const mutationLock = useRef(false);
  const retry = useRef<{ key: string; id: string } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [reason, setReason] = useState('');
  const [mazeDraft, updateMazeDraft] = useState<{ placements: string; fallback: number } | null>(null);
  const [charadesDraft, updateCharadesDraft] = useState<{ durationSeconds: number; correctPoints: number } | null>(null);
  const [wordDraft, updateWordDraft] = useState<string[] | null>(null);
  const draftVersions = useRef<{ maze?: string; charades?: string; words?: string }>({});
  const [bulk, setBulk] = useState('');
  const [codeGroup, setCodeGroup] = useState('');
  const [issuedCode, setIssuedCode] = useState<{ groupId: number; code: string } | null>(null);
  const [reviewGroup, setReviewGroup] = useState('');
  const [history, setHistory] = useState<History | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const historyRequest = useRef<{ sequence: number; controller: AbortController | null }>({ sequence: 0, controller: null });
  const [adjustment, setAdjustment] = useState({ game: 'maze' as GameType, group: '', amount: 0, reason: '' });
  const snapshot = feed.snapshot;
  const admin = snapshot?.admin;
  const maze = snapshot?.games.find(game => game.type === 'maze');
  const charades = snapshot?.games.find(game => game.type === 'charades');
  const setMazeDraft = (draft: typeof mazeDraft) => { draftVersions.current.maze = draft ? draftVersions.current.maze ?? maze?.updatedAt : undefined; updateMazeDraft(draft); };
  const setCharadesDraft = (draft: typeof charadesDraft) => { draftVersions.current.charades = draft ? draftVersions.current.charades ?? charades?.updatedAt : undefined; updateCharadesDraft(draft); };
  const setWordDraft = (draft: typeof wordDraft) => { draftVersions.current.words = draft ? draftVersions.current.words ?? charades?.updatedAt : undefined; updateWordDraft(draft); };
  const words = wordDraft ?? admin?.words.map(word => word.text) ?? [];
  const mazeValues = mazeDraft ?? { placements: admin?.maze.placements?.join(', ') || '', fallback: admin?.maze.fallback ?? 0 };
  const charadesValues = charadesDraft ?? admin?.charades ?? { durationSeconds: 600, correctPoints: 1 };
  const disabled = busy || feed.status !== 'live';

  const loadHistory = async (group: string, append = false) => {
    if (!group || (append && historyBusy)) return;
    historyRequest.current.controller?.abort();
    const controller = new AbortController();
    const sequence = ++historyRequest.current.sequence;
    historyRequest.current.controller = controller;
    setHistoryBusy(true); setError('');
    try {
      const params = new URLSearchParams({ groupId: group });
      if (append && history?.cursor) { params.set('before', history.cursor.at); params.set('beforeId', history.cursor.id); }
      const response = await fetch('/api/admin/games/attempts?' + params, { cache: 'no-store', signal: controller.signal });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load answers.');
      if (sequence === historyRequest.current.sequence) setHistory(current => append && current && current.roundId === data.history.roundId ? { ...data.history, attempts: [...current.attempts, ...data.history.attempts] } : data.history);
    } catch (e) { if (!controller.signal.aborted && sequence === historyRequest.current.sequence) setError(e instanceof Error ? e.message : 'Unable to load answers.'); }
    finally { if (sequence === historyRequest.current.sequence) setHistoryBusy(false); }
  };
  const mutate = async (game: GameType, action: string, payload: Record<string, unknown>, message = 'Changes saved.') => {
    if (mutationLock.current || feed.status !== 'live') return false;
    mutationLock.current = true; setBusy(true); setError(''); setNotice('');
    const key = JSON.stringify({ game, action, payload });
    if (retry.current?.key !== key) retry.current = { key, id: crypto.randomUUID() };
    try {
      const result = await postGameAction('/api/admin/games', { game, action, payload, requestId: retry.current.id });
      if (result.code) setIssuedCode({ groupId: result.groupId, code: result.code });
      retry.current = null; setNotice(message);
      await feed.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error && e.name !== 'TimeoutError' ? e.message : 'The connection timed out. Check the game state before retrying.');
      await feed.refresh(); return false;
    } finally { mutationLock.current = false; setBusy(false); }
  };
  const ask = (dialog: Confirmation) => { setError(''); setReason(''); setConfirmation(dialog); };
  const confirm = async () => {
    if (!confirmation) return;
    if (confirmation.needsReason && !reason.trim()) { setError('Enter a reason for this correction.'); return; }
    const successful = await mutate(confirmation.game, confirmation.action, { ...confirmation.payload, ...(confirmation.needsReason ? { reason: reason.trim() } : {}) }, confirmation.action === 'reset' ? 'Game reset. Its previous rounds are archived.' : 'Changes saved.');
    if (successful) { setConfirmation(null); if (confirmation.action === 'charades_correct' && reviewGroup) void loadHistory(reviewGroup); }
  };
  const transition = (game: Game, action: string) => {
    const payload = { expectedRoundId: game.currentRound?.id ?? null };
    if (action === 'reset') ask({ game: game.type, action, payload: { ...payload, confirmed: true }, title: `Reset ${game.name}?`, message: `All ${game.name} scores will be cleared from the scoreboard. Recorded rounds and the audit history will be kept.`, label: 'Reset Game' });
    else if (action === 'end') ask({ game: game.type, action, payload, title: `End ${game.name}?`, message: 'Facilitators will stop recording new results. All recorded results will be preserved.', label: 'End Game' });
    else void mutate(game.type, action, payload, action === 'prepare' ? `${game.name} is ready.` : `${game.name} started.`);
  };
  const saveMaze = async () => {
    const values = mazeValues.placements.split(/[\s,]+/).filter(Boolean).map(Number);
    if (!values.length || values.some(value => !Number.isInteger(value) || value < 0 || value > 100000) || !Number.isInteger(mazeValues.fallback) || mazeValues.fallback < 0) { setError('Enter nonnegative whole-number placement and fallback points.'); return; }
    if (await mutate('maze', 'settings', { placements: values, fallback: mazeValues.fallback, expectedVersion: draftVersions.current.maze }, 'Maze scoring saved.')) setMazeDraft(null);
  };
  const saveCharades = async () => {
    if (await mutate('charades', 'settings', { ...charadesValues, expectedVersion: draftVersions.current.charades }, 'Charades settings saved.')) setCharadesDraft(null);
  };
  const saveWords = async () => {
    const cleaned = words.map(word => word.trim());
    if (cleaned.some(word => !word || word.length > 100)) { setError('Every word must contain 1–100 characters. Remove empty rows.'); return; }
    if (new Set(cleaned.map(word => word.toLowerCase())).size !== cleaned.length) { setError('Remove duplicate words before saving.'); return; }
    if (await mutate('charades', 'words', { words: cleaned, expectedVersion: draftVersions.current.words }, 'Charades word deck saved.')) setWordDraft(null);
  };
  const addBulk = () => {
    const additions = bulk.split(/\r?\n/).map(word => word.trim()).filter(Boolean);
    const next = [...words, ...additions];
    if (new Set(next.map(word => word.trim().toLowerCase())).size !== next.length) { setError('The pasted list contains a duplicate word. Remove duplicates and try again.'); return; }
    setWordDraft(next); setBulk(''); setError('');
  };
  const reorder = (index: number, direction: 1 | -1) => {
    const next = [...words]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; setWordDraft(next);
  };
  const issueCode = () => {
    const groupId = Number(codeGroup);
    if (!groupId) return;
    if (admin?.facilitators.some(credential => credential.groupId === groupId)) ask({ game: 'maze', action: 'group_code', payload: { groupId }, title: 'Replace facilitator code?', message: 'Existing facilitator sessions for this group will lose access. Share the new code with the assigned facilitator.', label: 'Replace Code' });
    else void mutate('maze', 'group_code', { groupId }, 'Facilitator code created. Share it privately with this group’s facilitator.');
  };

  return <div className={styles.admin}>
    <div className={styles.adminTop}><div><h2>Games Management</h2><p className={styles.muted}>Configure rounds, manage facilitators, and review recorded results.</p></div>
      <div className={styles.actions}><Link className={`${styles.button} ${styles.secondary}`} href="/games" target="_blank">Facilitator view</Link><Link className={`${styles.button} ${styles.secondary}`} href="/gameview" target="_blank">Game display</Link><Link className={`${styles.button} ${styles.secondary}`} href="/score" target="_blank">Scoreboard</Link></div>
    </div>
    {feed.status === 'offline' && <p className={styles.error} role="alert">{feed.error}{snapshot && ' Showing the last received state; game actions are paused.'}</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {!snapshot && feed.status === 'loading' && <p className={styles.empty}>Loading game management…</p>}
    {snapshot && admin && <>
      <div className={styles.columns}>
        {snapshot.games.map(game => <section key={game.id} className={styles.frame}>
          <div className={styles.adminGameHeader}><h3>{game.name}</h3><span className={styles.status} data-state={game.state}>{STATE_LABELS[game.state]}</span></div>
          {game.currentRound && <p className={styles.muted}>Round {game.currentRound.number}{game.currentRound.startedAt ? ` · ${formatGameTime(gameTimeMs(game, now), game.type === 'maze', game.type === 'charades')}` : ''}</p>}
          <div className={styles.actions}>
            <button className={`${styles.button} ${styles.secondary}`} disabled={disabled || !['inactive', 'ended'].includes(game.state)} onClick={() => transition(game, 'prepare')}>Prepare</button>
            <button className={styles.button} disabled={disabled || game.state !== 'ready' || snapshot.games.some(item => item.state === 'running')} onClick={() => transition(game, 'start')}>Start</button>
            <button className={`${styles.button} ${styles.secondary}`} disabled={disabled || game.state !== 'running'} onClick={() => transition(game, 'end')}>End</button>
          </div>
          {game.type === 'maze' ? <div className={styles.settings}>
            <label className={styles.field}>Placement points, first to last<textarea className={styles.input} value={mazeValues.placements} disabled={disabled || game.state === 'running'} onChange={event => setMazeDraft({ ...mazeValues, placements: event.target.value })} /></label>
            <label className={styles.field}>Points beyond the configured placements<input className={styles.input} type="number" min={0} max={100000} value={mazeValues.fallback} disabled={disabled || game.state === 'running'} onChange={event => setMazeDraft({ ...mazeValues, fallback: Number(event.target.value) })} /></label>
            <div className={styles.actions}><button className={styles.button} disabled={disabled || game.state === 'running' || mazeDraft === null} onClick={() => void saveMaze()}>Save Maze Scoring</button>{mazeDraft !== null && <button className={styles.textButton} disabled={busy} onClick={() => setMazeDraft(null)}>Discard changes</button>}</div>
          </div> : <div className={styles.settings}>
            <div className={styles.settingsGrid}><label className={styles.field}>Duration in seconds<input className={styles.input} type="number" min={10} max={7200} value={charadesValues.durationSeconds} disabled={disabled || game.state === 'running'} onChange={event => setCharadesDraft({ ...charadesValues, durationSeconds: Number(event.target.value) })} /></label>
              <label className={styles.field}>Points per correct answer<input className={styles.input} type="number" min={0} max={100000} value={charadesValues.correctPoints} disabled={disabled || game.state === 'running'} onChange={event => setCharadesDraft({ ...charadesValues, correctPoints: Number(event.target.value) })} /></label></div>
            <p className={styles.muted}>{formatGameTime(charadesValues.durationSeconds * 1000, false, true)} round. Skips give zero points. {admin.words.length} words loaded.</p>
            <div className={styles.actions}><button className={styles.button} disabled={disabled || game.state === 'running' || charadesDraft === null} onClick={() => void saveCharades()}>Save Charades Settings</button>{charadesDraft !== null && <button className={styles.textButton} disabled={busy} onClick={() => setCharadesDraft(null)}>Discard changes</button>}</div>
          </div>}
          {game.state === 'running' && <p className={styles.notice}>Settings are locked until the round ends.</p>}
          <div className={styles.resetRow}><p>Clear this game’s scoreboard and start again.</p><button className={`${styles.button} ${styles.danger}`} disabled={disabled || game.state === 'inactive'} onClick={() => transition(game, 'reset')}>Reset…</button></div>
        </section>)}
      </div>

      <div className={styles.columns}>
        <section className={styles.frame}><h3 className={styles.sectionTitle}>Facilitator Access</h3>
          <p className={styles.muted}>Each code controls one group. A facilitator enters it on /games.</p>
          <div className={styles.form}><label>Group<select className={styles.input} value={codeGroup} onChange={event => setCodeGroup(event.target.value)} disabled={disabled}><option value="">Select a group</option>{snapshot.groups.map(group => <option key={group.groupId} value={group.groupId}>{group.name}{admin.facilitators.some(item => item.groupId === group.groupId) ? ' — code issued' : ''}</option>)}</select></label>
            <button className={styles.button} disabled={disabled || !codeGroup} onClick={issueCode}>{admin.facilitators.some(item => item.groupId === Number(codeGroup)) ? 'Replace Facilitator Code…' : 'Create Facilitator Code'}</button>
          </div>
          {issuedCode && <div><p className={styles.notice}>{snapshot.groups.find(group => group.groupId === issuedCode.groupId)?.name} facilitator code</p><code className={styles.code}>{issuedCode.code}</code>
            <button className={`${styles.button} ${styles.secondary}`} onClick={() => void navigator.clipboard.writeText(issuedCode.code).then(() => setNotice('Code copied.')).catch(() => setError('Select and copy the code above.'))}><Copy className="inline w-5 h-5 mr-2" />Copy Code</button>
            <p className={styles.muted}>The code is shown here once. Keep it private. Replace it if you lose it.</p></div>}
        </section>
        <section className={styles.frame}><h3 className={styles.sectionTitle}>Score Adjustment</h3>
          <form className={styles.form} onSubmit={event => { event.preventDefault(); const game = snapshot.games.find(item => item.type === adjustment.game); if (!game?.currentRound) { setError('Start a round before adding an adjustment.'); return; } ask({ game: adjustment.game, action: 'adjust', payload: { roundId: game.currentRound.id, groupId: Number(adjustment.group), amount: adjustment.amount, reason: adjustment.reason.trim() }, title: 'Apply score adjustment?', message: `${adjustment.amount >= 0 ? '+' : ''}${adjustment.amount} points for ${snapshot.groups.find(group => group.groupId === Number(adjustment.group))?.name}. Reason: ${adjustment.reason}`, label: 'Apply Adjustment' }); }}>
            <div className={styles.settingsGrid}><label>Game<select className={styles.input} value={adjustment.game} onChange={event => setAdjustment({ ...adjustment, game: event.target.value as GameType })} disabled={disabled}><option value="maze">Maze Game</option><option value="charades">Charades</option></select></label><label>Group<select className={styles.input} value={adjustment.group} onChange={event => setAdjustment({ ...adjustment, group: event.target.value })} required disabled={disabled}><option value="">Select a group</option>{snapshot.groups.map(group => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}</select></label></div>
            <label>Point change<input className={styles.input} type="number" min={-10000} max={10000} value={adjustment.amount} onChange={event => setAdjustment({ ...adjustment, amount: Number(event.target.value) })} required disabled={disabled} /></label>
            <label>Reason<input className={styles.input} maxLength={300} value={adjustment.reason} onChange={event => setAdjustment({ ...adjustment, reason: event.target.value })} required disabled={disabled} /></label>
            <button className={styles.button} disabled={disabled || adjustment.amount === 0}>Review Adjustment…</button>
          </form>
        </section>
      </div>

      <section className={styles.frame}><h3 className={styles.sectionTitle}>Charades Word Manager</h3><p className={styles.muted}>{words.length} words. Every group receives this same ordered deck when the round starts.</p>
        <div className={styles.columns}>
          <div><div className={styles.wordList}>{words.map((word, index) => <div className={styles.wordRow} key={index}>
            <input aria-label={`Word ${index + 1}`} className={styles.input} value={word} maxLength={100} disabled={disabled || charades?.state === 'running'} onChange={event => setWordDraft(words.map((value, position) => position === index ? event.target.value : value))} />
            <button className={`${styles.button} ${styles.secondary}`} aria-label={`Move word ${index + 1} up`} disabled={disabled || charades?.state === 'running' || index === 0} onClick={() => reorder(index, -1)}><ArrowUp size={18} /></button>
            <button className={`${styles.button} ${styles.secondary}`} aria-label={`Move word ${index + 1} down`} disabled={disabled || charades?.state === 'running' || index === words.length - 1} onClick={() => reorder(index, 1)}><ArrowDown size={18} /></button>
            <button className={`${styles.button} ${styles.secondary}`} aria-label={`Remove word ${index + 1}`} disabled={disabled || charades?.state === 'running'} onClick={() => setWordDraft(words.filter((_, position) => position !== index))}><Trash2 size={18} /></button>
          </div>)}</div>
            <div className={styles.actions}><button className={`${styles.button} ${styles.secondary}`} disabled={disabled || charades?.state === 'running' || words.length >= 1000} onClick={() => setWordDraft([...words, ''])}><Plus className="inline w-5 h-5 mr-2" />Add Word</button><button className={styles.button} disabled={disabled || charades?.state === 'running' || wordDraft === null} onClick={() => void saveWords()}>Save Word Deck</button>{wordDraft !== null && <button className={styles.textButton} disabled={busy} onClick={() => setWordDraft(null)}>Discard changes</button>}</div>
          </div>
          <div className={styles.form}><label>Bulk entry, one word per line<textarea className={styles.input} placeholder={'ELEPHANT\nCOMPUTER\nPYRAMID'} value={bulk} onChange={event => setBulk(event.target.value)} disabled={disabled || charades?.state === 'running'} /></label><button className={`${styles.button} ${styles.secondary}`} disabled={disabled || charades?.state === 'running' || !bulk.trim()} onClick={addBulk}>Add Pasted Words</button><p className={styles.muted}>Add the list, review it, then save the word deck.</p></div>
        </div>
      </section>

      <div className={styles.columns}>
        <section className={styles.frame}><h3 className={styles.sectionTitle}>Maze Results</h3><div className={styles.tableWindow}><table className={styles.monitor}><thead><tr><th>Group</th><th>Status</th><th>Time</th><th>Points</th><th><span className="sr-only">Correction</span></th></tr></thead><tbody>{snapshot.groups.map(group => <tr key={group.groupId}><th scope="row">{group.name}</th><td>{group.maze ? ordinal(group.maze.position) : maze?.state === 'running' && group.eligibleRounds.includes(maze.currentRound?.id || '') ? 'Playing' : 'No finish'}</td><td>{group.maze ? formatGameTime(group.maze.elapsedMs) : '—'}</td><td>{group.maze?.points ?? 0}</td><td>{group.maze && <button className={styles.textButton} disabled={disabled} onClick={() => ask({ game: 'maze', action: 'maze_undo', payload: { resultId: group.maze!.id }, title: `Undo ${group.name} finish?`, message: 'Remaining finishes will be re-ranked and their placement points recalculated. This group can record a new finish while Maze is running.', label: 'Undo Finish', needsReason: true })}>Undo…</button>}</td></tr>)}</tbody></table></div></section>
        <section className={styles.frame}><h3 className={styles.sectionTitle}>Charades Progress</h3><div className={styles.tableWindow}><table className={styles.monitor}><thead><tr><th>Group</th><th>Correct</th><th>Skipped</th><th>Points</th><th>Deck</th><th><span className="sr-only">Review</span></th></tr></thead><tbody>{snapshot.groups.map(group => <tr key={group.groupId}><th scope="row">{group.name}</th><td>{group.charades.correct}</td><td>{group.charades.skipped}</td><td>{group.charades.points}</td><td>{group.charades.correct + group.charades.skipped}/{group.charades.totalWords}</td><td><button className={styles.textButton} disabled={historyBusy} onClick={() => { setReviewGroup(String(group.groupId)); void loadHistory(String(group.groupId)); }}>Review</button></td></tr>)}</tbody></table></div></section>
      </div>

      {reviewGroup && <section className={styles.frame}><h3 className={styles.sectionTitle}>{snapshot.groups.find(group => group.groupId === Number(reviewGroup))?.name} Answers</h3>
        <div className={styles.actions}><button className={`${styles.button} ${styles.secondary}`} disabled={historyBusy} onClick={() => void loadHistory(reviewGroup)}>Reload Answers</button><button className={styles.textButton} onClick={() => { historyRequest.current.sequence++; historyRequest.current.controller?.abort(); setHistoryBusy(false); setReviewGroup(''); setHistory(null); }}>Close Review</button></div>
        {historyBusy && <p className={styles.notice}>Loading answers…</p>}
        {history && history.roundId !== charades?.currentRound?.id ? <p className={styles.notice}>The round changed. Reload answers to review the current round.</p> : history && <>
          <div className={styles.tableWindow}><table className={styles.monitor}><thead><tr><th>Word</th><th>Result</th><th>Points</th><th><span className="sr-only">Correction</span></th></tr></thead><tbody>{history.attempts.map(attempt => <tr key={attempt.id}><th scope="row">{attempt.word}</th><td>{attempt.result === 'correct' ? 'Correct' : 'Skipped'}</td><td>{attempt.points}</td><td><button className={styles.textButton} disabled={disabled} onClick={() => ask({ game: 'charades', action: 'charades_correct', payload: { attemptId: attempt.id, expectedResult: attempt.result, result: attempt.result === 'correct' ? 'skip' : 'correct' }, title: 'Correct this answer?', message: `${attempt.word} will be marked ${attempt.result === 'correct' ? 'Skipped' : 'Correct'}. Its points will be recalculated using this round’s scoring.`, label: 'Save Correction', needsReason: true })}>Change to {attempt.result === 'correct' ? 'Skipped' : 'Correct'}…</button></td></tr>)}</tbody></table></div>
          {!history.attempts.length && <p className={styles.empty}>No answers recorded for this group.</p>}
          {history.cursor && <button className={`${styles.button} ${styles.secondary}`} disabled={historyBusy} onClick={() => void loadHistory(reviewGroup, true)}>Load Older Answers</button>}
        </>}
      </section>}

      <section className={styles.frame}><h3 className={styles.sectionTitle}>Overall Scores</h3><Leaderboard rows={snapshot.scoreboard} compact /></section>
      <section className={styles.frame}><h3 className={styles.sectionTitle}>Game Audit History</h3><ul className={styles.auditList}>{admin.audit.map(log => <li key={log.id}><strong>{log.action.replace(/^gaap\./, '').replaceAll('_', ' ')}</strong><small>{new Date(log.created_at).toLocaleString()} · {log.actor_label || 'System'}</small><details><summary>Recorded change</summary><pre>{JSON.stringify({ before: log.before_data, after: log.after_data }, null, 2)}</pre></details></li>)}</ul>{!admin.audit.length && <p className={styles.empty}>Game actions will be recorded here.</p>}</section>
    </>}
    <ConfirmDialog open={Boolean(confirmation)} title={confirmation?.title || ''} confirmLabel={confirmation?.label || 'Confirm'} busy={busy} onConfirm={() => void confirm()} onClose={() => setConfirmation(null)}>
      <p>{confirmation?.message}</p>
      {confirmation?.needsReason && <label className={styles.field}>Correction reason<textarea className={styles.input} value={reason} onChange={event => setReason(event.target.value)} maxLength={300} required /></label>}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </ConfirmDialog>
  </div>;
}
