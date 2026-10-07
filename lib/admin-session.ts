import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

export const ADMIN_SESSION_COOKIE = 'qr_gaap_admin_session';
const SESSION_DURATION_SECONDS = 60 * 60 * 12;

type AdminSessionPayload = {
  role: 'admin';
  expiresAt: number;
};

function sessionSecret() {
  const secret = process.env.QR_GAAP_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('QR_GAAP_SESSION_SECRET must be set to a random value of at least 32 characters.');
  }
  return secret;
}

export function createAdminSessionToken() {
  const payload: AdminSessionPayload = {
    role: 'admin',
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', sessionSecret())
    .update(encodedPayload)
    .digest('base64url');

  return { token: `${encodedPayload}.${signature}`, maxAge: SESSION_DURATION_SECONDS };
}

function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim();
  }
  return null;
}

export function isAdminSessionValid(request: Request) {
  const token = readCookie(request, ADMIN_SESSION_COOKIE);
  if (!token) return false;

  const separator = token.lastIndexOf('.');
  if (separator < 1) return false;

  const encodedPayload = token.slice(0, separator);
  const providedSignature = token.slice(separator + 1);

  try {
    const expectedSignature = createHmac('sha256', sessionSecret())
      .update(encodedPayload)
      .digest();
    const actualSignature = Buffer.from(providedSignature, 'base64url');
    if (
      actualSignature.length !== expectedSignature.length ||
      !timingSafeEqual(actualSignature, expectedSignature)
    ) {
      return false;
    }

    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as AdminSessionPayload;

    return payload.role === 'admin' && payload.expiresAt > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}
