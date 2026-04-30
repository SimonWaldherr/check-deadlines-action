const assert = require('node:assert/strict');
const test = require('node:test');

const {
  findCheckAnnotations,
  parseCheckAnnotation,
  formatMentionSuffix,
  parseExcludeInput
} = require('../dist/index.js');

test('findCheckAnnotations handles multiple annotations and nested parentheses', () => {
  const data = [
    '// @CHECK(2026-12-31; note (with parens))',
    '// @CHECK(2027-01-01; second)'
  ].join('\n');

  assert.deepEqual(Array.from(findCheckAnnotations(data)), [
    {
      text: '@CHECK(2026-12-31; note (with parens))',
      value: '2026-12-31; note (with parens)',
      index: 3
    },
    {
      text: '@CHECK(2027-01-01; second)',
      value: '2027-01-01; second',
      index: 45
    }
  ]);
});

test('findCheckAnnotations ignores unclosed annotations', () => {
  assert.deepEqual(Array.from(findCheckAnnotations('// @CHECK(2026-12-31')), []);
});

test('parseCheckAnnotation validates dates and extracts mentions', () => {
  assert.equal(parseCheckAnnotation(''), null);
  assert.equal(parseCheckAnnotation('2026-02-30'), null);
  assert.deepEqual(parseCheckAnnotation('2026-12-31; Review; @alice; @team/platform'), {
    deadlineUtc: Date.UTC(2026, 11, 31),
    mentions: ['@alice', '@team/platform']
  });
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
