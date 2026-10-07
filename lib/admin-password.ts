import 'server-only';

import { scrypt, timingSafeEqual } from 'node:crypto';
import { supabaseQuery, supabaseRest } from '@/lib/supabase-rest';

const SCRYPT_N = 32_768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const DERIVED_KEY_BYTES = 64;
const MAX_SCRYPT_MEMORY_BYTES = 64 * 1024 * 1024;

function deriveKey(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      salt,
      DERIVED_KEY_BYTES,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: MAX_SCRYPT_MEMORY_BYTES },
      (error, key) => error ? reject(error) : resolve(key),
    );
  });
}

export async function verifyAdminPassword(password: string) {
  if (!password || password.length > 256) return false;

  const rows = await supabaseRest<Array<{ password_hash: string }>>(
    `admin_credentials?${supabaseQuery({ select: 'password_hash', id: 'eq.1', limit: '1' })}`,
  );
  const storedHash = rows[0]?.password_hash;
  if (!storedHash) {
    throw new Error('The admin password is not set up. Run supabase/admin-credentials.sql in Supabase.');
  }

  const [algorithm, costN, costR, costP, saltHex, keyHex] = storedHash.split('$');
  if (
    algorithm !== 'scrypt' ||
    Number(costN) !== SCRYPT_N ||
    Number(costR) !== SCRYPT_R ||
    Number(costP) !== SCRYPT_P ||
    !/^[0-9a-f]{32}$/i.test(saltHex || '') ||
    !/^[0-9a-f]{128}$/i.test(keyHex || '')
  ) {
    throw new Error('The stored admin password hash has an unsupported format.');
  }

  const salt = Buffer.from(saltHex, 'hex');
  const expectedKey = Buffer.from(keyHex, 'hex');
  const actualKey = await deriveKey(password, salt);
  return timingSafeEqual(actualKey, expectedKey);
}
