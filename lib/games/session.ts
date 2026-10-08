import 'server-only';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { supabaseQuery, supabaseRest } from '@/lib/supabase-rest';

export const FACILITATOR_COOKIE = 'qr_gaap_facilitator';
const DURATION = 12 * 60 * 60;
export interface FacilitatorSession { role: 'facilitator'; groupId: number; credentialVersion: string; sessionId: string; expiresAt: number }

function secret() {
  const value = process.env.QR_GAAP_SESSION_SECRET;
  if (!value || value.length < 32) throw new Error('Admin session secret is not configured.');
  return value;
}
export function hashAccessCode(code: string) {
  return createHash('sha256').update(code.trim()).digest('hex');
}
export function createGroupAccessCode(groupId: number, requestId: string) {
  return createHmac('sha256', secret()).update(`group-code:${groupId}:${requestId}`).digest('base64url').slice(0, 24);
}
export function createFacilitatorToken(groupId: number, credentialVersion: string) {
  const session: FacilitatorSession = { role: 'facilitator', groupId, credentialVersion, sessionId: randomUUID(), expiresAt: Math.floor(Date.now() / 1000) + DURATION };
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  const signature = createHmac('sha256', secret()).update('facilitator:' + payload).digest('base64url');
  return { token: payload + '.' + signature, maxAge: DURATION, session };
}
export function readFacilitatorToken(request: Request): FacilitatorSession | null {
  const cookie = request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(FACILITATOR_COOKIE + '='));
  if (!cookie) return null;
  try {
    const parts = cookie.slice(FACILITATOR_COOKIE.length + 1).split('.');
    if (parts.length !== 2) return null;
    const signature = Buffer.from(parts[1], 'base64url');
    const expected = createHmac('sha256', secret()).update('facilitator:' + parts[0]).digest();
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return null;
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as FacilitatorSession;
    if (payload.role !== 'facilitator' || !Number.isInteger(payload.groupId) || payload.groupId < 1 || !payload.credentialVersion || !payload.sessionId || payload.expiresAt <= Date.now() / 1000) return null;
    return payload;
  } catch { return null; }
}
export async function requireFacilitator(request: Request) {
  const session = readFacilitatorToken(request);
  if (!session) return null;
  const rows = await supabaseRest<{ credential_version: string }[]>(`facilitator_credentials?${supabaseQuery({ group_id: 'eq.' + session.groupId, select: 'credential_version', limit: '1' })}`);
  return rows[0]?.credential_version === session.credentialVersion ? session : null;
}
export async function verifyFacilitatorCode(groupId: number, code: string) {
  if (!code || code.length > 128 || !Number.isInteger(groupId) || groupId < 1) return null;
  const rows = await supabaseRest<{ access_code_hash: string; credential_version: string }[]>(`facilitator_credentials?${supabaseQuery({ group_id: 'eq.' + groupId, select: 'access_code_hash,credential_version', limit: '1' })}`);
  const stored = rows[0];
  if (!stored || !/^[0-9a-f]{64}$/.test(stored.access_code_hash)) return null;
  const actual = Buffer.from(hashAccessCode(code), 'hex');
  return timingSafeEqual(actual, Buffer.from(stored.access_code_hash, 'hex')) ? stored.credential_version : null;
}
