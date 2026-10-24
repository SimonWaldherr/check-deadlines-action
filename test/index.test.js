const assert = require('node:assert/strict');
const test = require('node:test');

const {
  findCheckAnnotations,
  parseCheckAnnotation,
  formatMentionSuffix,
  parseExcludeInput
} = require('../dist/index.js');

const check = '@' + 'CHECK';

test('findCheckAnnotations handles multiple annotations and nested parentheses', () => {
  const data = [
    `// ${check}(2026-12-31; note (with parens))`,
    `// ${check}(2027-01-01; second)`
  ].join('\n');

  assert.deepEqual(Array.from(findCheckAnnotations(data)), [
    {
      text: `${check}(2026-12-31; note (with parens))`,
      value: '2026-12-31; note (with parens)',
      index: 3
    },
    {
      text: `${check}(2027-01-01; second)`,
      value: '2027-01-01; second',
      index: 45
    }
  ]);
});

test('findCheckAnnotations ignores unclosed annotations', () => {
  assert.deepEqual(Array.from(findCheckAnnotations(`// ${check}(2026-12-31`)), []);
});

test('findCheckAnnotations keeps interleaved iterators independent', () => {
  const first = findCheckAnnotations(`${check}(2027-01-01) ${check}(2027-02-01)`);
  const second = findCheckAnnotations(`${check}(2027-03-01) ${check}(2027-04-01)`);

  assert.equal(first.next().value.value, '2027-01-01');
  assert.equal(second.next().value.value, '2027-03-01');
  assert.equal(first.next().value.value, '2027-02-01');
  assert.equal(second.next().value.value, '2027-04-01');
  assert.equal(first.next().done, true);
  assert.equal(second.next().done, true);
});

test('findCheckAnnotations starts fresh after an iterator is abandoned', () => {
  for (const annotation of findCheckAnnotations(`${check}(2027-01-01)`)) {
    assert.equal(annotation.value, '2027-01-01');
    break;
  }

  assert.equal(Array.from(findCheckAnnotations(`${check}(2027-02-01)`)).length, 1);
});

test('findCheckAnnotations recovers complete annotations after an unclosed marker', () => {
  const data = `${check}(unclosed\n${check}(2027-01-01; note (nested))`;
  assert.deepEqual(Array.from(findCheckAnnotations(data)).map(({ value }) => value), [
    '2027-01-01; note (nested)'
  ]);
});

test('findCheckAnnotations does not emit nested markers twice', () => {
  const outer = `${check}(2027-01-01; see ${check}(2027-02-01))`;
  const following = `${check}(2027-03-01)`;
  const data = `unrelated (parentheses)\n${outer}\n${following}`;

  assert.deepEqual(Array.from(findCheckAnnotations(data)), [
    { text: outer, value: `2027-01-01; see ${check}(2027-02-01)`, index: data.indexOf(outer) },
    { text: following, value: '2027-03-01', index: data.indexOf(following) }
  ]);
});

test('findCheckAnnotations recovers outermost complete descendants in source order', () => {
  const first = `${check}(2027-01-01; see ${check}(2027-02-01))`;
  const second = `${check}(2027-03-01)`;
  const data = `${check}(unclosed (\n${first}\n${check}(also unclosed\n${second}`;

  assert.deepEqual(Array.from(findCheckAnnotations(data)).map(({ text }) => text), [first, second]);
});

test('findCheckAnnotations handles deeply nested unclosed markers without recursion', () => {
  const prefix = `${check}(unclosed `.repeat(10000);
  const text = `${check}(2027-01-01; note (nested))`;

  assert.deepEqual(Array.from(findCheckAnnotations(prefix + text)), [
    { text, value: '2027-01-01; note (nested)', index: prefix.length }
  ]);
});

test('parseCheckAnnotation validates dates and extracts mentions', () => {
  assert.equal(parseCheckAnnotation(''), null);
  assert.equal(parseCheckAnnotation('2026-02-30'), null);
  assert.deepEqual(parseCheckAnnotation('2026-12-31; Review; @alice; @team/platform'), {
    deadlineUtc: Date.UTC(2026, 11, 31),
    mentions: ['@alice', '@team/platform']
  });
});

test('parseCheckAnnotation rejects invalid calendar dates and accepts leap days', () => {
  const invalidDates = [
    '2027-02-29', '1900-02-29', '2026-00-01', '2026-13-01',
    '2026-01-00', '2026-04-31', '2026-1-01', '2026-01-01junk'
  ];
  for (const value of invalidDates) {
    assert.equal(parseCheckAnnotation(value), null, value);
  }

  for (const value of ['2000-02-29', '2028-02-29', '0000-02-29', '0099-12-31']) {
    assert.equal(new Date(parseCheckAnnotation(value).deadlineUtc).toISOString().slice(0, 10), value);
  }
});

test('formatMentionSuffix formats mention metadata', () => {
  assert.equal(formatMentionSuffix([]), '');
  assert.equal(formatMentionSuffix(['@alice']), ' (mentions: @alice)');
  assert.equal(formatMentionSuffix(['@alice', '@team/platform']), ' (mentions: @alice, @team/platform)');
});

test('parseExcludeInput includes defaults, trims values, and removes duplicates', () => {
  assert.deepEqual(parseExcludeInput(''), ['node_modules', 'dist']);
  assert.deepEqual(parseExcludeInput(' dist, coverage, , node_modules, generated '), [
    'node_modules',
    'dist',
    'coverage',
    'generated'
  ]);
});
