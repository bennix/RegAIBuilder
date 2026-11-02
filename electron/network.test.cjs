const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fetchWithSystemProxy, networkError } = require('./network.cjs');

test('uses Electron transport and preserves streaming request options', async () => {
  const body = JSON.stringify({ stream: true });
  const request = fetchWithSystemProxy({ fetch: async (url, options) => {
    assert.equal(url, 'https://example.com/chat/completions');
    assert.equal(options.method, 'POST');
    assert.equal(options.body, body);
    assert.equal(options.headers.Authorization, 'Bearer test');
    assert.ok(options.signal instanceof AbortSignal);
    return new Response('data: hello\n\n');
  } }, 'https://example.com/chat/completions', {
    method: 'POST', body, headers: { Authorization: 'Bearer test' },
  });
  try {
    assert.equal(await (await request.response).text(), 'data: hello\n\n');
  } finally { request.dispose(); }
});

test('deadline aborts a response that stalls after headers', async () => {
  const request = fetchWithSystemProxy({ fetch: async () => new Response('') },
    'https://example.com', {}, 10);
  await request.response;
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(request.signal.aborted, true);
  request.dispose();
});

test('cleanup stops deadline and errors include actionable cause', async () => {
  const request = fetchWithSystemProxy({ fetch: async () => new Response('') },
    'https://example.com', {}, 10);
  await request.response;
  request.dispose();
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(request.signal.aborted, false);
  assert.match(networkError(new TypeError('fetch failed', {
    cause: Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' }),
  })), /ECONNREFUSED/);
  assert.match(networkError(new Error('net::ERR_PROXY_CONNECTION_FAILED')), /设置中检测代理/);
  assert.match(networkError(new Error('net::ERR_CONNECTION_CLOSED')), /中途关闭/);
  assert.match(networkError(new Error('abort'), true), /超时/);
  assert.equal(networkError(new Error('系统加密不可用')), '系统加密不可用');
});
