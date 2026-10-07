import { randomBytes, scrypt } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { emitKeypressEvents } from 'node:readline';

const SCRYPT_N = 32_768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const DERIVED_KEY_BYTES = 64;
const MAX_SCRYPT_MEMORY_BYTES = 64 * 1024 * 1024;

async function loadLocalEnv() {
  const contents = await readFile(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function readHiddenPassword(prompt) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error('Run this command in an interactive terminal so the password can be entered without echoing.');
  }

  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdout.write(prompt);

  return new Promise((resolvePassword, rejectPassword) => {
    let password = '';
    const finish = (error) => {
      process.stdin.off('keypress', onKeypress);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
      if (error) rejectPassword(error);
      else resolvePassword(password);
    };
    const onKeypress = (character, key = {}) => {
      if (key.ctrl && key.name === 'c') return finish(new Error('Password setup cancelled.'));
      if (key.name === 'return' || key.name === 'enter') return finish();
      if (key.name === 'backspace') {
        password = password.slice(0, -1);
        return;
      }
      if (character && !key.ctrl && !key.meta) password += character;
    };

    process.stdin.on('keypress', onKeypress);
  });
}

function deriveHash(password, salt) {
  return new Promise((resolveHash, rejectHash) => {
    scrypt(
      password,
      salt,
      DERIVED_KEY_BYTES,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: MAX_SCRYPT_MEMORY_BYTES },
      (error, key) => error ? rejectHash(error) : resolveHash(key),
    );
  });
}

async function setAdminPassword() {
  await loadLocalEnv();
  const supabaseUrl = process.env.SUPABASE_URL?.trim().replace(/\/$/, '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.');
  }

  const password = await readHiddenPassword('New admin password (input hidden): ');
  if (password.length < 12 || password.length > 256) {
    throw new Error('Use an admin password between 12 and 256 characters.');
  }

  const salt = randomBytes(16);
  const derivedKey = await deriveHash(password, salt);
  const passwordHash = `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
  const response = await fetch(`${supabaseUrl}/rest/v1/admin_credentials?on_conflict=id`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ id: 1, password_hash: passwordHash, updated_at: new Date().toISOString() }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const error = await response.text();
    if (response.status === 404) {
      throw new Error('The admin_credentials table was not found. Run supabase/admin-credentials.sql first.');
    }
    throw new Error(`Supabase could not save the admin password hash (HTTP ${response.status}): ${error}`);
  }

  console.log('Admin password hash saved to Supabase. The password itself was not stored in a file.');
}

setAdminPassword().catch(error => {
  console.error(error instanceof Error ? error.message : 'Unable to set the admin password.');
  process.exitCode = 1;
});
