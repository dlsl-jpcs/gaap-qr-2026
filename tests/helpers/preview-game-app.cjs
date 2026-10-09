/* eslint-disable @typescript-eslint/no-require-imports */
// Local-only, disposable browser preview. Never connects to the configured Supabase.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createHash, scryptSync } = require('node:crypto');
const { createGameDb } = require('./game-db.cjs');
const { createRestDb } = require('./rest-db.cjs');

async function main() {
  const root = path.resolve(__dirname, '../..');
  const nfcPreview = process.argv.includes('--nfc');
  const engine = await createGameDb();
  const adapter = createRestDb(engine.db);
  await engine.db.exec(fs.readFileSync(path.join(root, 'supabase/runtime-functions.sql'), 'utf8'));
  await engine.db.exec(fs.readFileSync(path.join(root, 'supabase/admin-credentials.sql'), 'utf8'));
  if (nfcPreview) await engine.db.exec("update public.event_settings set registration_mode = 'nfc' where singleton;");
  const salt = Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex');
  const key = scryptSync('preview-password-only', salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  await engine.db.query('insert into admin_credentials(id,password_hash) values(1,$1)', ['scrypt$32768$8$1$' + salt.toString('hex') + '$' + key.toString('hex')]);
  for (let id = 1; id <= 14; id++) await engine.db.query('update facilitator_credentials set access_code_hash=$1 where group_id=$2', [createHash('sha256').update('preview-group-' + id).digest('hex'), id]);
  await engine.command('charades', 'words', { words: ['ELEPHANT', 'COMPUTER', 'PYRAMID', 'VOLCANO', 'BASKETBALL'] });
  const round = await engine.start('maze');
  await engine.finish(round.id, 4); await engine.finish(round.id, 6); await engine.finish(round.id, 9);

  let unavailable = false;
  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    // Synthetic students exercise the existing server-side DLSL lookup without
    // a reader, a real portal request or any production participant writes.
    if (nfcPreview && req.url === '/__fixture/student-info' && req.method === 'POST') {
      let body = ''; for await (const chunk of req) body += chunk;
      const form = new URLSearchParams(body);
      if (form.get('regkey') !== 'isolated-portal-key' || form.get('action') !== 'registration_tapregister') { res.writeHead(403); res.end('{}'); return; }
      const card = form.get('card_tag');
      if (card === '04badbad') { res.writeHead(503); res.end('{}'); return; }
      if (card === '04dead00') { res.end('{}'); return; }
      if (card === '04c0ffee') await new Promise(resolve => setTimeout(resolve, 1800));
      const names = { '04a1b2c3': 'Demo Student One', '04d4e5f6': 'Demo Student Two', '04c0ffee': 'Demo Student Three' };
      const name = names[card] || (/^\d+$/.test(card || '') ? 'Demo Student Number' : null);
      res.end(JSON.stringify(name ? { name, email_address: 'demo_student@fixture.invalid' } : {}));
      return;
    }
    if (req.url === '/__fixture/availability' && req.method === 'POST' && req.headers.apikey === 'isolated-preview-key') {
      let body = ''; for await (const chunk of req) body += chunk;
      try { unavailable = JSON.parse(body).unavailable === true; res.end(JSON.stringify({ unavailable })); }
      catch { res.writeHead(400); res.end('{}'); }
      return;
    }
    if (!req.url.startsWith('/rest/v1/') || req.headers.apikey !== 'isolated-preview-key') { res.writeHead(403); res.end('{}'); return; }
    if (unavailable) { res.writeHead(503); res.end(JSON.stringify({ message: 'Injected fixture failure' })); return; }
    try {
      let body = ''; for await (const chunk of req) body += chunk;
      const result = await adapter.supabaseRest(req.url.slice('/rest/v1/'.length), { method: req.method, ...(body ? { body } : {}) });
      res.end(JSON.stringify(result));
    } catch (error) { res.writeHead(error.status || 500); res.end(JSON.stringify({ message: error.message, code: error.code })); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(3033, '127.0.0.1', resolve); });
  const child = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3022'], {
    cwd: root, windowsHide: true, stdio: 'inherit', env: { ...process.env,
      NODE_ENV: 'development', SUPABASE_URL: 'http://127.0.0.1:3033', SUPABASE_SERVICE_ROLE_KEY: 'isolated-preview-key',
      QR_GAAP_SESSION_SECRET: 'isolated-preview-secret-that-is-not-used-in-production', QR_GAAP_ISOLATED_PREVIEW: '1', NEXT_TELEMETRY_DISABLED: '1',
      ...(nfcPreview ? { PORTAL_BASE_URL: 'http://127.0.0.1:3033', PORTAL_HELPER_PATH: '/__fixture/student-info', REG_KEY: 'isolated-portal-key' } : {}),
    },
  });
  console.log(`Disposable preview: http://127.0.0.1:3022/${nfcPreview ? '' : 'games'} | admin: preview-password-only | group codes: preview-group-N`);
  let stopping = false;
  const stop = async () => { if (stopping) return; stopping = true; child.kill(); server.close(); await engine.db.close(); };
  process.on('SIGINT', () => void stop()); process.on('SIGTERM', () => void stop());
  child.once('exit', code => { void stop().then(() => { process.exitCode = code || 0; }); });
  child.once('error', error => { console.error(error.message); void stop(); process.exitCode = 1; });
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
