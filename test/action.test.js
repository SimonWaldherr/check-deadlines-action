const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const action = path.resolve(__dirname, '../dist/index.js');
const fixedClock = path.join(__dirname, 'fixtures/fixed-clock.cjs');
const check = '@' + 'CHECK';
const now = new Date('2026-10-24T12:00:00Z');

function dateInDays(days) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days))
    .toISOString().slice(0, 10);
}

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'check-deadlines-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function write(directory, name, contents) {
  const file = path.join(directory, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
  return file;
}

function runAction(directory, inputs = {}, environment = {}) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('INPUT_')));
  const result = spawnSync(process.execPath, ['--require', fixedClock, action], {
    encoding: 'utf8',
    timeout: 10000,
    env: {
      ...env,
      CHECK_DEADLINES_TEST_NOW: String(now.getTime()),
      INPUT_DIR: directory,
      'INPUT_WARNING-DAYS': '7',
      'INPUT_WARN-ONLY': 'false',
      INPUT_EXCLUDE: '',
      ...Object.fromEntries(Object.entries(inputs).map(([key, value]) => [`INPUT_${key.toUpperCase()}`, value])),
      ...environment
    }
  });
  assert.ifError(result.error);
  assert.equal(result.stderr, '');
  return result;
}

test('action reports all overdue annotations with their file and line', (t) => {
  const directory = fixture(t);
  write(directory, 'a.js', `// first line\r\n// ${check}(${dateInDays(-1)}; @alice)\r\n\r\n// ${check}(${dateInDays(-2)})\n`);
  write(directory, 'nested/b.js', `// ${check}(${dateInDays(-1)})`);

  const result = runAction(directory);
  assert.equal(result.status, 1);
  assert.equal((result.stdout.match(/Deadline exceeded:/g) || []).length, 3);
  assert.match(result.stdout, /file=.*a\.js,line=2::Deadline exceeded:/);
  assert.match(result.stdout, /file=.*a\.js,line=4::Deadline exceeded:/);
  assert.match(result.stdout, /file=.*b\.js,line=1::Deadline exceeded:/);
  assert.match(result.stdout, /mentions: @alice/);
  assert.match(result.stdout, /::error::At least one deadline exceeded/);
});

test('action preserves line numbers across multiline and adjacent annotations', (t) => {
  const directory = fixture(t);
  write(directory, 'code.js', [
    '// ä😀 before the first marker',
    `${check}(${dateInDays(-1)}; note (`,
    `nested)) ${check}(${dateInDays(-1)})`,
    `${check}(invalid) ${check}(${dateInDays(-1)})`
  ].join('\n'));

  const result = runAction(directory);
  assert.equal(result.status, 1);
  assert.equal((result.stdout.match(/Deadline exceeded:/g) || []).length, 3);
  for (const line of [2, 3, 4]) {
    assert.match(result.stdout, new RegExp(`file=.*code\\.js,line=${line}::Deadline exceeded:`));
  }
  assert.match(result.stdout, /file=.*code\.js,line=4::Invalid @CHECK annotation:/);
});

test('warn-only keeps overdue warnings while succeeding', (t) => {
  const directory = fixture(t);
  write(directory, 'code.js', `${check}(${dateInDays(-1)})`);

  const result = runAction(directory, { 'warn-only': 'true' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Deadline exceeded:/);
  assert.doesNotMatch(result.stdout, /::error/);
});

test('deadline day is inclusive in UTC, including a zero-day warning window', (t) => {
  const directory = fixture(t);
  write(directory, 'code.js', `${check}(${dateInDays(0)})\n${check}(${dateInDays(1)})`);

  for (const timezone of ['Pacific/Kiritimati', 'America/Los_Angeles']) {
    const result = runAction(directory, { 'warning-days': '0' }, { TZ: timezone });
    assert.equal(result.status, 0);
    assert.equal((result.stdout.match(/::notice /g) || []).length, 1);
    assert.match(result.stdout, /Deadline in 0 days:/);
    assert.doesNotMatch(result.stdout, /Deadline exceeded:/);
  }
});

test('notice window includes its boundary and reports actual days remaining', (t) => {
  const directory = fixture(t);
  write(directory, 'code.js', [1, 2, 3].map((days) => `${check}(${dateInDays(days)})`).join('\n'));

  const result = runAction(directory, { 'warning-days': '2' });
  assert.equal(result.status, 0);
  assert.equal((result.stdout.match(/::notice /g) || []).length, 2);
  assert.match(result.stdout, /Deadline in 1 day:/);
  assert.match(result.stdout, /Deadline in 2 days:/);
});

test('action rejects malformed warning-days instead of truncating them', (t) => {
  const directory = fixture(t);
  for (const value of ['-1', '1.5', '7days', '1e2', 'Infinity', '9007199254740992']) {
    const result = runAction(directory, { 'warning-days': value });
    assert.equal(result.status, 1, value);
    assert.match(result.stdout, /Invalid 'warning-days' value:/, value);
  }
});

test('blank inputs use defaults and padded decimal warning-days remain valid', (t) => {
  const directory = fixture(t);
  write(directory, 'code.js', `${check}(${dateInDays(7)})\n${check}(${dateInDays(8)})`);

  for (const value of ['', ' 007 ']) {
    const result = runAction(directory, { 'warning-days': value });
    assert.equal(result.status, 0);
    assert.equal((result.stdout.match(/::notice /g) || []).length, 1);
    assert.match(result.stdout, /Deadline in 7 days:/);
  }
});

test('action applies default and configured exclusions at every depth', (t) => {
  const directory = fixture(t);
  const excludedFiles = [
    'node_modules/a.js', 'dist/a.js', '.git/a.js', 'nested/.hidden/a.js',
    'generated/a.js', 'nested/generated/a.js', 'ignored.js', 'nested/ignored.js'
  ];
  for (const name of excludedFiles) {
    write(directory, name, `${check}(${dateInDays(-1)})`);
  }
  write(directory, 'nested/.visible.js', `${check}(${dateInDays(0)})`);

  const result = runAction(directory, { exclude: ' generated, ignored.js, dist, ' });
  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stdout, /Deadline exceeded:/);
  assert.match(result.stdout, /file=.*\.visible\.js,line=1::Deadline in 0 days:/);
});

test('action skips NUL-containing binary files', (t) => {
  const directory = fixture(t);
  write(directory, 'data.bin', Buffer.from(`\0${check}(${dateInDays(-1)})`));

  const result = runAction(directory);
  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stdout, /Deadline exceeded:/);
});

test('files without annotations do not produce output', (t) => {
  const directory = fixture(t);
  write(directory, 'code.js', 'function identity(value) { return (value); }\n'.repeat(10000));

  const result = runAction(directory);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
});

test('action skips symbolic links, including directory cycles and dangling links', { skip: process.platform === 'win32' }, (t) => {
  const directory = fixture(t);
  const external = fixture(t);
  const target = write(external, 'overdue.js', `${check}(${dateInDays(-1)})`);
  fs.symlinkSync(target, path.join(directory, 'linked.js'));
  fs.symlinkSync(directory, path.join(directory, 'cycle'));
  fs.symlinkSync(path.join(external, 'missing'), path.join(directory, 'dangling'));

  const result = runAction(directory);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
});

test('invalid dates warn with the correct line without failing the action', (t) => {
  const directory = fixture(t);
  write(directory, 'code.js', `// note\n${check}(2027-02-29)\n${check}(${dateInDays(30)}; note (nested))`);

  const result = runAction(directory);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /file=.*code\.js,line=2::Invalid @CHECK annotation:/);
  assert.doesNotMatch(result.stdout, /Deadline exceeded:/);
});

test('missing scan directories fail even in warn-only mode', (t) => {
  const directory = fixture(t);
  const result = runAction(path.join(directory, 'missing'), { 'warn-only': 'true' });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /::error::.*ENOENT/);
});

test('unreadable text files fail instead of silently hiding deadlines', {
  skip: process.platform === 'win32' || (process.getuid && process.getuid() === 0)
}, (t) => {
  const directory = fixture(t);
  const file = write(directory, 'unreadable.js', `${check}(${dateInDays(-1)})`);
  fs.chmodSync(file, 0);

  const result = runAction(directory, { 'warn-only': 'true' });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /::error::Unable to read file/);
});
