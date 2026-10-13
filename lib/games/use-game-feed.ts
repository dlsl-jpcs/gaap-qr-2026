'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameSnapshot } from './types';
import { clockOffset } from './timers';

type Feed = { source: string; snapshot: GameSnapshot | null; status: 'loading' | 'live' | 'offline'; error: string; unauthorized: boolean; offset: number };
export function useGameFeed(endpoint: string, enabled = true, intervalMs = 2000) {
  const [feed, setFeed] = useState<Feed>({ source: endpoint, snapshot: null, status: 'loading', error: '', unauthorized: false, offset: 0 });
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let inFlight: Promise<void> | null = null;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | null = null;
    const run = async () => {
      clearTimeout(timer);
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 8000);
      const started = Date.now();
      let unauthorized = false;
      try {
        const response = await fetch(endpoint, { cache: 'no-store', signal: controller.signal });
        const body = await response.json();
        unauthorized = response.status === 401 || response.status === 403;
        if (!response.ok || !body.snapshot) throw new Error(body.message || 'Unable to load game state.');
        if (active) setFeed({ source: endpoint, snapshot: body.snapshot, status: 'live', error: '', unauthorized: false, offset: clockOffset(body.snapshot.serverNow, started, Date.now()) });
      } catch (error) {
        if (active) setFeed(current => ({ ...current, source: endpoint, snapshot: unauthorized ? null : current.source === endpoint ? current.snapshot : null, status: 'offline', unauthorized, error: error instanceof Error && error.name !== 'AbortError' ? error.message : 'Connection lost. Reconnecting…' }));
      } finally {
        clearTimeout(timeout);
        if (active && !unauthorized) timer = setTimeout(refresh, intervalMs);
      }
    };
    const refresh = () => {
      if (inFlight) return inFlight;
      inFlight = run().finally(() => { inFlight = null; });
      return inFlight;
    };
    // A refresh after a mutation must start after any older poll has finished.
    refreshRef.current = async () => { if (inFlight) await inFlight; if (active) await refresh(); };
    void refresh();
    const resync = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('online', resync);
    window.addEventListener('focus', resync);
    document.addEventListener('visibilitychange', resync);
    return () => { active = false; clearTimeout(timer); controller?.abort(); window.removeEventListener('online', resync); window.removeEventListener('focus', resync); document.removeEventListener('visibilitychange', resync); };
  }, [endpoint, enabled, intervalMs]);
  const refresh = useCallback(() => refreshRef.current(), []);
  const snapshot = enabled && feed.source === endpoint ? feed.snapshot : null;
  return { ...feed, snapshot, refresh };
}
export function useServerClock(offset: number) {
  const [localNow, setLocalNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setLocalNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, []);
  return localNow + offset;
}
export async function postGameAction(endpoint: string, payload: Record<string, unknown>) {
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(12000) });
  const body = await response.json();
  if (!response.ok || !body.success) throw new Error(body.message || 'Unable to save this action. Please try again.');
  return body;
}
