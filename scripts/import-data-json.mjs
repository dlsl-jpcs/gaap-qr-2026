import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function loadLocalEnv() {
  const envPath = resolve(process.cwd(), '.env.local');
  return readFile(envPath, 'utf8').then(contents => {
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value;
    }
  });
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}. Add it to .env.local before importing.`);
  return value;
}

async function requestSupabase(url, serviceKey, resource, options = {}) {
  const response = await fetch(`${url}/rest/v1/${resource}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase rejected ${resource} (${response.status}): ${errorText}`);
  }
}

await loadLocalEnv();
const supabaseUrl = requiredEnv('SUPABASE_URL').replace(/\/$/, '');
const serviceKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
const args = process.argv.slice(2);
const sourcePath = resolve(process.cwd(), args.find(argument => !argument.startsWith('--')) || 'data.json');
const source = JSON.parse(await readFile(sourcePath, 'utf8'));

if (!Array.isArray(source.groups) || !Array.isArray(source.students)) {
  throw new Error('The source JSON must contain groups and students arrays.');
}

const groups = source.groups.map(group => ({
  id: Number(group.id),
  name: `Group ${String(group.id).padStart(2, '0')}`,
  capacity: Number(group.maxCapacity),
}));
const students = source.students.map(student => ({
  id: student.id,
  name: String(student.name || '').trim(),
  // Older local records stored both typed student numbers and card UIDs in
  // studentNumber, with no identifier-kind field. Preserve the value there;
  // current duplicate detection compares both database identifier columns.
  student_number: String(student.studentNumber || '').trim() || null,
  card_tag: null,
  group_id: Number(student.groupId),
  joined_at: student.timestamp || new Date().toISOString(),
}));

if (groups.some(group => !Number.isInteger(group.id) || group.id < 1 || group.id > 14 || !Number.isInteger(group.capacity) || group.capacity < 1)) {
  throw new Error('A group has an invalid ID or capacity. Expected group IDs 1–14 and capacity of at least 1.');
}
if (students.some(student => !student.id || !student.name || !Number.isInteger(student.group_id) || !groups.some(group => group.id === student.group_id))) {
  throw new Error('A participant has invalid data or references a group not present in the source file.');
}

// Do not overwrite existing Supabase rows: the importer is safe to re-run and
// leaves rows already present in the cloud database unchanged.
await requestSupabase(supabaseUrl, serviceKey, 'groups?on_conflict=id', {
  method: 'POST',
  headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
  body: JSON.stringify(groups),
});

for (let offset = 0; offset < students.length; offset += 500) {
  await requestSupabase(supabaseUrl, serviceKey, 'students?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify(students.slice(offset, offset + 500)),
  });
}

if (args.includes('--include-registration-mode')) {
  const validModes = new Set(['nfc', 'studentNumber', 'manualName']);
  if (!validModes.has(source.registrationMode)) {
    throw new Error('The source JSON has an invalid registrationMode.');
  }
  await requestSupabase(supabaseUrl, serviceKey, 'event_settings?singleton=eq.true', {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ registration_mode: source.registrationMode }),
  });
}

console.log(`Imported ${groups.length} group records and ${students.length} participant records from ${sourcePath}.`);
console.log('Existing cloud rows were left unchanged. Verify the Supabase table contents before using the live site.');
