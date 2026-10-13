"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Pause, Play } from 'lucide-react';
import GroupRoster, { type BoardGroup } from './GroupRoster';
import styles from './view.module.css';

const SCREEN_DURATION = 8_000;
const formatGroup = (number: number) => String(number).padStart(2, '0');

export default function ViewScreen() {
  const reducedMotion = useReducedMotion();
  const [feed, setFeed] = useState<{ groups: BoardGroup[]; status: 'connecting' | 'live' | 'offline'; loaded: boolean }>({
    groups: [], status: 'connecting', loaded: false,
  });
  const [columns, setColumns] = useState(4);
  const [screen, setScreen] = useState({ bank: 0, roster: 0 });
  const [pageCounts, setPageCounts] = useState<Record<number, number>>({});
  const [paused, setPaused] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState('');

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController;
    const refresh = async () => {
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch('/api/groups', { cache: 'no-store', signal: controller.signal });
        const data = await response.json();
        if (!response.ok || !data.success || !Array.isArray(data.groups)) throw new Error('Groups unavailable');
        const nextGroups: BoardGroup[] = [...data.groups].sort((a, b) => a.groupId - b.groupId);
        if (active) setFeed(current => {
          const unchanged = JSON.stringify(current.groups) === JSON.stringify(nextGroups);
          if (unchanged && current.status === 'live' && current.loaded) return current;
          return { groups: unchanged ? current.groups : nextGroups, status: 'live', loaded: true };
        });
      } catch {
        if (active) setFeed(current => ({ ...current, status: 'offline' }));
      } finally {
        clearTimeout(timeout);
        if (active) timer = setTimeout(refresh, 5000);
      }
    };
    void refresh();
    return () => {
      active = false;
      clearTimeout(timer);
      controller?.abort();
    };
  }, []);

  useEffect(() => {
    const resize = () => {
      const width = window.innerWidth;
      setColumns(width >= 1800 ? 4 : width >= 1250 ? 3 : width >= 760 ? 2 : 1);
    };
    const frame = requestAnimationFrame(resize);
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const { groups, status, loaded } = feed;
  const bankCount = Math.ceil(groups.length / columns);
  const bank = bankCount ? screen.bank % bankCount : 0;
  const visibleGroups = groups.slice(bank * columns, (bank + 1) * columns);
  const rosterPageCount = Math.max(1, ...visibleGroups.map(group => pageCounts[group.groupId] ?? 1));
  const rosterPage = Math.min(screen.roster, rosterPageCount - 1);

  const recordPageCount = useCallback((groupId: number, count: number) => {
    setPageCounts(current => current[groupId] === count ? current : { ...current, [groupId]: count });
  }, []);

  const move = useCallback((direction: 1 | -1) => {
    if (!bankCount) return;
    setScreen(current => {
      const currentBank = current.bank % bankCount;
      const bankGroups = groups.slice(currentBank * columns, (currentBank + 1) * columns);
      const pages = Math.max(1, ...bankGroups.map(group => pageCounts[group.groupId] ?? 1));
      const currentRoster = Math.min(current.roster, pages - 1);
      if (direction === 1 && currentRoster + 1 < pages) return { bank: currentBank, roster: currentRoster + 1 };
      if (direction === -1 && currentRoster > 0) return { bank: currentBank, roster: currentRoster - 1 };
      const nextBank = (currentBank + direction + bankCount) % bankCount;
      const nextGroups = groups.slice(nextBank * columns, (nextBank + 1) * columns);
      const nextPages = Math.max(1, ...nextGroups.map(group => pageCounts[group.groupId] ?? 1));
      return { bank: nextBank, roster: direction === 1 ? 0 : nextPages - 1 };
    });
  }, [bankCount, columns, groups, pageCounts]);

  const hasMoreScreens = bankCount > 1 || rosterPageCount > 1;
  const moveRef = useRef(move);
  useEffect(() => { moveRef.current = move; }, [move]);
  useEffect(() => {
    if (paused || !hasMoreScreens) return;
    const timer = setTimeout(() => moveRef.current(1), SCREEN_DURATION);
    return () => clearTimeout(timer);
  }, [paused, hasMoreScreens, bank, rosterPage]);

  const toggleFullscreen = async () => {
    setFullscreenError('');
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setFullscreenError('Use your browser’s fullscreen option to fill the TV.');
    }
  };

  return (
    <main className={styles.display} style={{ '--columns': Math.min(columns, Math.max(groups.length, 1)) } as CSSProperties}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <Image src="/jpcs-logo.png" alt="JPCS De La Salle Lipa Chapter" width={96} height={96} className={styles.logo} priority />
          <h1 className={styles.headline}>Groupings</h1>
        </div>
      </header>

      <motion.section key={bank} className={styles.board} aria-label="Group member assignments" initial={{ opacity: reducedMotion ? 1 : 0 }} animate={{ opacity: 1 }} transition={{ duration: reducedMotion ? 0 : 0.25 }}>
        {visibleGroups.map(group => (
          <GroupRoster key={group.groupId} group={group} page={rosterPage} onPageCount={recordPageCount} />
        ))}
        {groups.length === 0 && (
          <div className={styles.boardMessage}>
            <h2>{loaded ? 'The board is ready' : status === 'offline' ? 'Waiting for the roster' : 'Loading groups…'}</h2>
            <p>{loaded ? 'Groups will appear here when they are created.' : status === 'offline' ? 'The board will reconnect automatically.' : 'Member names will appear as participants register.'}</p>
          </div>
        )}
      </motion.section>

      <footer className={styles.footer}>
        {bankCount > 0 && (
          <nav className={styles.banks} aria-label="Choose groups to display">
            {Array.from({ length: bankCount }, (_, index) => {
              const first = groups[index * columns];
              const last = groups[Math.min((index + 1) * columns, groups.length) - 1];
              return (
                <button key={first.groupId} className={styles.bank} aria-label={'Show groups ' + first.groupId + ' to ' + last.groupId} aria-current={index === bank ? 'page' : undefined} onClick={() => setScreen({ bank: index, roster: 0 })}>
                  <span>{formatGroup(first.groupId)}{first !== last && '–' + formatGroup(last.groupId)}</span>
                  {index === bank && hasMoreScreens && !paused && <span key={bank + '-' + rosterPage} className={styles.progress} style={{ animationDuration: SCREEN_DURATION + 'ms' }} />}
                </button>
              );
            })}
          </nav>
        )}
        <div className={styles.controls}>
          <button onClick={() => move(-1)} disabled={!hasMoreScreens} aria-label="Previous roster screen" title="Previous screen"><ChevronLeft /></button>
          <button onClick={() => setPaused(current => !current)} disabled={!hasMoreScreens} aria-label={paused ? 'Resume rotation' : 'Pause rotation'} title={paused ? 'Resume rotation' : 'Pause rotation'}>{paused ? <Play /> : <Pause />}</button>
          <button onClick={() => move(1)} disabled={!hasMoreScreens} aria-label="Next roster screen" title="Next screen"><ChevronRight /></button>
          <button onClick={toggleFullscreen} aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} title={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>{fullscreen ? <Minimize2 /> : <Maximize2 />}</button>
        </div>
        {fullscreenError && <p className={styles.fullscreenError} role="status">{fullscreenError}</p>}
      </footer>
    </main>
  );
}
