import 'server-only';
import { NextResponse } from 'next/server';
import { SupabaseRequestError, supabaseRest } from '@/lib/supabase-rest';
import { rankScores } from './ranking';
import type { GameSnapshot } from './types';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type RpcResult = { success: boolean; status?: number; message?: string; duplicate?: boolean; record?: unknown };
export class GameRequestError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function requireUuid(value: unknown, name: string) {
  if (typeof value !== 'string' || !UUID.test(value)) throw new GameRequestError(`Invalid ${name}.`);
  return value;
}
export async function readGameBody(request: Request) {
  const text = await request.text();
  if (text.length > 150_000) throw new GameRequestError('The request is too large.', 413);
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch { throw new GameRequestError('Invalid request body.'); }
}
/** Block cross-origin cookie mutations independently of frontend controls. */
export function requireSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  // Next may reconstruct the URL with an internal localhost hostname. Host is
  // the destination requested by the browser; do not trust x-forwarded-host.
  const requestUrl = new URL(request.url);
  const host = request.headers.get('host');
  const protocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const scheme = protocol === 'https' || protocol === 'http' ? protocol + ':' : requestUrl.protocol;
  const destination = host ? new URL(`${scheme}//${host}`) : requestUrl;
  if (origin && origin !== destination.origin) throw new GameRequestError('Request origin is not allowed.', 403);
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw new GameRequestError('Request origin is not allowed.', 403);
}
export async function gameRpc(name: string, payload: Record<string, unknown>) {
  return supabaseRest<RpcResult>('rpc/' + name, { method: 'POST', body: JSON.stringify(payload) });
}
export async function gameSnapshot(groupId: number | null = null, admin = false) {
  const snapshot = await supabaseRest<GameSnapshot>('rpc/gaap_game_snapshot', { method: 'POST', body: JSON.stringify({ p_group_id: groupId, p_admin: admin }) });
  return { ...snapshot, scoreboard: rankScores(snapshot.scoreboard) };
}
export function gameResponse(result: RpcResult) {
  return NextResponse.json(result, { status: result.success ? 200 : result.status || 409, headers: { 'Cache-Control': 'no-store' } });
}
export function gameError(error: unknown, admin = false) {
  if (error instanceof GameRequestError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  const needsMigration = error instanceof SupabaseRequestError && ['PGRST202', 'PGRST205', '42703', '42P01'].includes(error.code || '');
  console.error('Game operation failed:', error instanceof Error ? error.message : 'Unknown error');
  return NextResponse.json({ success: false, message: needsMigration
    ? admin ? 'Game database setup is required. Run supabase/migrations/202610080001_game_management.sql in Supabase, then retry.' : 'Game setup is not complete. Please contact the event admin.'
    : 'Unable to reach the game server. Check your connection and try again.' }, { status: 503 });
}
