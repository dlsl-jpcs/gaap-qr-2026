/* eslint-disable @typescript-eslint/no-require-imports */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const typescript = require('typescript');
const { createGameDb } = require('./helpers/game-db.cjs');
const { createRestDb } = require('./helpers/rest-db.cjs');

const projectRoot = path.resolve(__dirname, '..');

function loadTypeScriptModule(filename, overrides = {}) {
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = typescript.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
    },
  }).outputText;
  const loadedModule = new Module(filename, module);
  loadedModule.filename = filename;
  loadedModule.paths = Module._nodeModulePaths(path.dirname(filename));

  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'server-only') return {};
    if (Object.hasOwn(overrides, request)) return overrides[request];
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    loadedModule._compile(compiled, filename);
  } finally {
    Module._load = originalLoad;
  }

  return loadedModule.exports;
}

function makeScanner(options = {}) {
  const scans = [];
  const errors = [];
  const buffers = [];
  const { NfcKeyboardScanBuffer } = loadTypeScriptModule(
    path.join(projectRoot, 'lib', 'nfc-keyboard-scan.ts'),
  );
  const scanner = new NfcKeyboardScanBuffer({
    onBufferChange: value => buffers.push(value),
    onInvalid: reason => errors.push(reason),
    onScan: value => scans.push(value),
  }, options.pauseMs ?? 100, options.duplicateWindowMs ?? 1000);

  return { scanner, scans, errors, buffers };
}

function typeScan(scanner, value) {
  for (const key of value) scanner.acceptKey(key);
}

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

test('buffers hexadecimal keyboard input and completes on Enter only once', () => {
  const { scanner, scans } = makeScanner();
  typeScan(scanner, '04A1B2C3');

  assert.equal(scanner.finish(1000), 'submitted');
  assert.equal(scanner.finish(1001), 'ignored');
  assert.deepEqual(scans, ['04a1b2c3']);
  scanner.clear();
});

test('completes a keyboard scan after a short pause', async () => {
  const { scanner, scans } = makeScanner({ pauseMs: 10 });
  typeScan(scanner, '04A1B2C3');

  await wait(20);

  assert.deepEqual(scans, ['04a1b2c3']);
  scanner.clear();
});

test('rejects partial and non-hex input and clears the buffer', () => {
  const { scanner, scans, errors, buffers } = makeScanner();
  typeScan(scanner, '04A1B2');
  assert.equal(scanner.finish(), 'invalid');

  typeScan(scanner, '04A1B2C3');
  assert.equal(scanner.acceptKey('Z'), 'invalid');

  assert.deepEqual(scans, []);
  assert.deepEqual(errors, ['incomplete', 'invalid-character']);
  assert.equal(buffers.at(-1), '');
  scanner.clear();
});

test('suppresses duplicate endings and rapid repeated taps, then accepts a later tap', () => {
  const { scanner, scans } = makeScanner({ duplicateWindowMs: 1000 });

  typeScan(scanner, '04A1B2C3');
  assert.equal(scanner.finish(1000), 'submitted');
  assert.equal(scanner.finish(1001), 'ignored');

  typeScan(scanner, '04A1B2C3');
  assert.equal(scanner.finish(1500), 'duplicate');

  typeScan(scanner, '04A1B2C3');
  assert.equal(scanner.finish(2101), 'submitted');
  assert.deepEqual(scans, ['04a1b2c3', '04a1b2c3']);
  scanner.clear();
});

test('clears a partial scan when NFC mode is left, then accepts scans after returning', () => {
  const { scanner, scans } = makeScanner();
  typeScan(scanner, '04A1');
  scanner.clear();

  assert.equal(scanner.finish(), 'ignored');
  typeScan(scanner, '04A1B2C3');
  assert.equal(scanner.finish(), 'submitted');
  assert.deepEqual(scans, ['04a1b2c3']);
  scanner.clear();
});

test('captures only focused NFC input and ignores shortcuts, repeats, and unfocused pages', () => {
  const { canCaptureNfcKeyboardInput } = loadTypeScriptModule(
    path.join(projectRoot, 'lib', 'nfc-keyboard-scan.ts'),
  );
  const focusedNfcPage = {
    registrationMode: 'nfc',
    modeLoading: false,
    pageFocused: true,
    pageVisible: true,
    scanFieldFocused: true,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    repeat: false,
    composing: false,
  };

  assert.equal(canCaptureNfcKeyboardInput(focusedNfcPage), true);
  for (const change of [
    { registrationMode: 'studentNumber' },
    { registrationMode: 'manualName' },
    { pageFocused: false },
    { pageVisible: false },
    { scanFieldFocused: false },
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { repeat: true },
    { composing: true },
  ]) {
    assert.equal(canCaptureNfcKeyboardInput({ ...focusedNfcPage, ...change }), false);
  }
});

test('NFC route sends normalized hexadecimal UID to server-side DLSL card_tag', async () => {
  let axiosOptions;
  const axiosStub = async options => {
    axiosOptions = options;
    return { data: { email_address: 'test@example.edu', name: 'Test Student' } };
  };
  const environment = {
    PORTAL_BASE_URL: process.env.PORTAL_BASE_URL,
    PORTAL_HELPER_PATH: process.env.PORTAL_HELPER_PATH,
    REG_KEY: process.env.REG_KEY,
  };
  process.env.PORTAL_BASE_URL = 'https://portal.test.invalid';
  process.env.PORTAL_HELPER_PATH = '/helper.php';
  process.env.REG_KEY = 'test-only-key';

  try {
    const { fetchStudentInfo } = loadTypeScriptModule(
      path.join(projectRoot, 'lib', 'api.ts'),
      { axios: axiosStub },
    );
    const result = await fetchStudentInfo('04a1b2c3');
    const formData = new URLSearchParams(axiosOptions.data);

    assert.equal(result.email, 'test@example.edu');
    assert.equal(formData.get('action'), 'registration_tapregister');
    assert.equal(formData.get('card_tag'), '04a1b2c3');
    assert.equal(formData.get('regkey'), 'test-only-key');
  } finally {
    for (const [key, value] of Object.entries(environment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('join route preserves group assignment, modes, lookup errors, and duplicate handling', async t => {
  const engine = await createGameDb();
  const rest = createRestDb(engine.db);
  let route;
  let db;
  let lookupCalls = [];
  let lookupImplementation = async () => ({ email: 'test@example.edu', name: 'Test Student' });

  const responseJson = (body, init = {}) => new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { 'Content-Type': 'application/json' },
  });
  const dbPath = path.join(projectRoot, 'lib', 'db.ts');

  try {
    await engine.db.exec(fs.readFileSync(path.join(projectRoot, 'supabase', 'runtime-functions.sql'), 'utf8'));
    await engine.db.exec('delete from public.groups where id > 2; update public.groups set capacity = 2;');
    db = loadTypeScriptModule(dbPath, { '@/lib/supabase-rest': rest });
    route = loadTypeScriptModule(
      path.join(projectRoot, 'app', 'api', 'join', 'route.ts'),
      {
        'next/server': { NextResponse: { json: responseJson } },
        '@/lib/db': db,
        '@/lib/supabase-rest': rest,
        '@/lib/api': {
          fetchStudentInfo: async identifier => {
            lookupCalls.push(identifier);
            return lookupImplementation(identifier);
          },
          deriveDisplayName: () => 'Test Student',
        },
      },
    );
  } catch (error) {
    await engine.db.close();
    throw error;
  }

  const resetData = async registrationMode => {
    lookupCalls = [];
    lookupImplementation = async () => ({ email: 'test@example.edu', name: 'Test Student' });
    await engine.db.exec("delete from public.students; insert into public.students(name, student_number, group_id) values ('Seed Student', 'existing-id', 1);");
    await engine.db.query('update public.event_settings set registration_mode = $1 where singleton', [registrationMode]);
  };
  const post = payload => route.POST(new Request('http://localhost/api/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }));

  try {
    await t.test('new NFC registration goes to the least-filled group', async () => {
      await resetData('nfc');
      const response = await post({ studentNumber: '04A1B2C3' });
      const body = await response.json();

      assert.equal(body.success, true);
      assert.equal(body.student.groupId, 2);
      assert.deepEqual(lookupCalls, ['04a1b2c3']);
    });

    await t.test('repeat NFC registration returns the existing participant without inserting again', async () => {
      await resetData('nfc');
      const first = await (await post({ studentNumber: '04A1B2C3' })).json();
      const repeated = await (await post({ studentNumber: '04a1b2c3' })).json();
      const data = await db.getDbData();

      assert.equal(repeated.success, true);
      assert.equal(repeated.student.id, first.student.id);
      assert.equal(data.students.filter(student => student.studentNumber.toLowerCase() === '04a1b2c3').length, 1);
      assert.equal(data.students.length, 2);
    });

    await t.test('manual name mode assigns a participant without calling DLSL', async () => {
      await resetData('manualName');
      const response = await post({ name: '  Manual Participant  ' });
      const body = await response.json();

      assert.equal(body.success, true);
      assert.equal(body.student.name, 'Manual Participant');
      assert.equal(body.student.groupId, 2);
      assert.deepEqual(lookupCalls, []);
    });

    await t.test('student number mode keeps numeric DLSL lookup behavior', async () => {
      await resetData('studentNumber');
      const response = await post({ studentNumber: '202610101' });
      const body = await response.json();

      assert.equal(body.success, true);
      assert.deepEqual(lookupCalls, ['202610101']);
    });

    await t.test('DLSL lookup failure returns 502 without adding a participant', async () => {
      await resetData('studentNumber');
      lookupImplementation = async () => { throw new Error('simulated DLSL outage'); };
      const originalError = console.error;
      console.error = () => {};

      try {
        const response = await post({ studentNumber: '202610101' });
        const body = await response.json();
        assert.equal(response.status, 502);
        assert.match(body.message, /temporarily unavailable/i);
        assert.equal((await db.getDbData()).students.length, 1);
      } finally {
        console.error = originalError;
      }
    });
  } finally {
    await engine.db.close();
  }
});
