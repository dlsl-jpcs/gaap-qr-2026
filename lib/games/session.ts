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
type CredentialRow = { group_id: number; access_code_hash: string; credential_version: string };
const CREDENTIALS = 'facilitator_credentials';
const matches = (code: string, stored: string) =>
  /^[0-9a-f]{64}$/.test(stored) && timingSafeEqual(Buffer.from(hashAccessCode(code), 'hex'), Buffer.from(stored, 'hex'));

/** One universal PIN: the same hash and version are stored for every group, so the
 *  database still checks a facilitator's group credential on each action. */
export async function setFacilitatorPin(pin: string) {
  const groups = await supabaseRest<{ id: number }[]>(`groups?${supabaseQuery({ select: 'id' })}`);
  if (!groups.length) throw new Error('No groups exist.');
  const hash = hashAccessCode(pin);
  const version = randomUUID();
  const now = new Date().toISOString();
  await supabaseRest(`${CREDENTIALS}?${supabaseQuery({ on_conflict: 'group_id' })}`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(groups.map(group => ({ group_id: group.id, access_code_hash: hash, credential_version: version, updated_at: now }))),
  });
  try {
    await supabaseRest('audit_log', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ action: 'gaap.facilitator_pin_set', entity: 'facilitator_credentials', actor_label: 'admin', after_data: { groups: groups.length } }) });
  } catch { /* The audit entry is best effort; the PIN itself is already saved. */ }
}
export async function verifyFacilitatorCode(groupId: number, code: string) {
  if (!code || code.length > 128 || !Number.isInteger(groupId) || groupId < 1) return null;
  const own = await supabaseRest<CredentialRow[]>(`${CREDENTIALS}?${supabaseQuery({ group_id: 'eq.' + groupId, select: 'group_id,access_code_hash,credential_version', limit: '1' })}`);
  if (own[0]) return matches(code, own[0].access_code_hash) ? own[0].credential_version : null;
  // A group created after the PIN was set has no row yet: accept the shared PIN and add it.
  const shared = await supabaseRest<CredentialRow[]>(`${CREDENTIALS}?${supabaseQuery({ select: 'group_id,access_code_hash,credential_version', order: 'updated_at.desc', limit: '1' })}`);
  const stored = shared[0];
  if (!stored || !matches(code, stored.access_code_hash)) return null;
  await supabaseRest(`${CREDENTIALS}?${supabaseQuery({ on_conflict: 'group_id' })}`, {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ group_id: groupId, access_code_hash: stored.access_code_hash, credential_version: stored.credential_version }),
  });
  return stored.credential_version;
}
