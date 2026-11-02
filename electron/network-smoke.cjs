// Run with: electron electron/network-smoke.cjs (no API key required).
const { app, net, session } = require('electron');
const { fetchWithSystemProxy } = require('./network.cjs');
const { normalizeProxy, getNetworkSession, apiBase } = require('./proxy.cjs');
const assert = require('node:assert/strict');

app.whenReady().then(async () => {
  let request;
  try {
    assert.equal(normalizeProxy({ proxyMode: 'manual', proxyUrl: '127.0.0.1:7897' }).proxyUrl, 'http://127.0.0.1:7897');
    assert.equal(normalizeProxy({ proxyMode: 'manual', proxyUrl: 'socks5://localhost:1080' }).proxyUrl, 'socks5://localhost:1080');
    assert.throws(() => normalizeProxy({ proxyMode: 'manual', proxyUrl: 'http://user:pass@localhost:80' }));
    assert.throws(() => normalizeProxy({ proxyMode: 'bad' }));
    assert.throws(() => apiBase('file:///tmp'));
    const direct = await getNetworkSession({ proxyMode: 'direct' });
    assert.equal(await direct.resolveProxy('https://zenmux.ai'), 'DIRECT');
    for (const config of [{ proxyMode: 'system' }, { proxyMode: 'manual', proxyUrl: 'http://127.0.0.1:7897' }]) {
      const ses = await getNetworkSession(config);
      console.log(config.proxyMode, await ses.resolveProxy('https://zenmux.ai'));
      for (const endpoint of ['models', 'chat/completions']) {
        request = fetchWithSystemProxy(ses, `https://zenmux.ai/api/v1/${endpoint}`,
          endpoint === 'models' ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'anthropic/claude-sonnet-4.6', stream: true, messages: [{ role: 'user', content: 'test' }] }) }, 15000);
        const response = await request.response;
        await response.body?.cancel();
        console.log(config.proxyMode, endpoint, response.status);
        assert.ok(response.ok || response.status === 401 || response.status === 403);
        request.dispose();
      }
    }
    app.exit(0);
  } catch (error) {
    console.error(error.message);
    app.exit(1);
  } finally {
    request?.dispose();
  }
});
