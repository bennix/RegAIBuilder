import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, parsePattern, testPattern } from './engine.js';

test('literal text is escaped', () => {
  const { source, errors } = compile([{ id: '1', kind: 'text', value: 'a.b' }]);
  assert.equal(errors.length, 0);
  assert.equal(source, 'a\\.b');
  assert.equal(testPattern(source, '', 'a.b').matches.length, 1);
  assert.equal(testPattern(source, '', 'axb').matches.length, 0);
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
