import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_TASKS, buildAiContext } from './ai-context.js';

test('every analysis task uses the latest source, flags, examples and syntax error', () => {
  for (const task of AI_TASKS.filter((item) => item.id !== 'generate')) {
    const first = buildAiContext({ taskId: task.id, pattern: '^old$', flags: 'u', cases: [], text: '', error: '', prompt: '' });
    const latest = buildAiContext({ taskId: task.id, pattern: '[new', flags: 'im', cases: [{ input: 'new', should: false }], text: 'latest sample', error: '缺少方括号', prompt: '补充要求' });
    assert.ok(first.includes('^old$'));
    assert.ok(!latest.includes('^old$'));
    for (const value of ['[new', 'im', 'latest sample', '缺少方括号', '补充要求']) assert.ok(latest.includes(value));
    assert.throws(() => buildAiContext({ taskId: task.id, pattern: '', prompt: '' }), /先在编辑器中填写/);
  }
});

test('generation can start without an existing expression', () => {
  assert.ok(buildAiContext({ taskId: 'generate', pattern: '', flags: 'u', cases: [], text: '', prompt: '匹配单词' }).includes('匹配单词'));
});
