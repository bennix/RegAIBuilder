import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, parsePattern, testPattern } from './engine.js';
import { SAMPLES } from './catalog.js';

test('literal text is escaped', () => {
  const { source, errors } = compile([{ id: '1', kind: 'text', value: 'a.b' }]);
  assert.equal(errors.length, 0);
  assert.equal(source, 'a\\.b');
  assert.equal(testPattern(source, '', 'a.b').matches.length, 1);
  assert.equal(testPattern(source, '', 'axb').matches.length, 0);
});

test('multiline samples produce matches and date rejects an invalid month', () => {
  for (const sample of SAMPLES) {
    const result = testPattern(sample.pattern, sample.flags, sample.sample);
    assert.equal(result.ok, true, sample.name);
    assert.ok(result.matches.length > 0, sample.name);
  }
  const date = SAMPLES.find((sample) => sample.name === '日期');
  assert.equal(testPattern(date.pattern, date.flags, '2026-13-40').matches.length, 0);
  assert.equal(testPattern(date.pattern, 'u', '2026-11-01\n1999-02-28').matches.length, 0);
  assert.equal(testPattern(date.pattern, 'mu', '2026-11-01\n1999-02-28').matches.length, 2);
});

test('quantifier and class roundtrip through parse', () => {
  const nodes = parsePattern('^\\d{2,4}?xyz$');
  const { source, errors } = compile(nodes);
  assert.equal(errors.length, 0);
  assert.equal(source, '^\\d{2,4}?xyz$');
});

test('named group and lookahead', () => {
  const nodes = parsePattern('(?<y>\\d{4})-(?=\\d{2})');
  const { source } = compile(nodes);
  assert.equal(source, '(?<y>\\d{4})-(?=\\d{2})');
  const hit = testPattern(source, '', '2026-11');
  assert.equal(hit.matches[0].named.y, '2026');
});

test('unbalanced groups are reported', () => {
  const { errors } = compile([{ id: '1', kind: 'groupOpen', mode: 'capture' }]);
  assert.equal(errors.length, 1);
});

test('missing named reference explains meaning and repair in Chinese', () => {
  const result = testPattern('^\\d{4}-(?:\\k<name>[a-z])$', 'u', '2026-ab');
  assert.equal(result.ok, false);
  assert.match(result.error, /不存在：name/);
  assert.match(result.error, /同一段文本/);
  assert.match(result.error, /\(\?<name>/);
  assert.match(result.error, /文本或字符类积木/);
  assert.match(result.errorDetail, /Invalid named capture referenced/);
});

test('valid named references still match and syntax errors explain repairs', () => {
  assert.equal(testPattern('(?<word>[a-z]+)-\\k<word>', 'u', 'ab-ab').ok, true);
  assert.match(testPattern('[abc', 'u', '').error, /右方括号/);
  assert.match(testPattern('*a', 'u', '').error, /量词前/);
  assert.match(testPattern('[z-a]', 'u', '').error, /起点大于终点/);
  assert.match(testPattern('(', 'u', '').error, /右括号/);
});
