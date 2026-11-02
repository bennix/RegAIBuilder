const { session } = require('electron');

function normalizeProxy(raw = {}) {
  const proxyMode = raw.proxyMode || 'system';
  if (!['system', 'manual', 'direct'].includes(proxyMode)) throw new Error('代理模式无效');
  let proxyUrl = String(raw.proxyUrl || '').trim();
  if (proxyMode === 'manual') {
    if (!proxyUrl.includes('://')) proxyUrl = `http://${proxyUrl}`;
    let url;
    try { url = new URL(proxyUrl); } catch { throw new Error('请填写有效代理地址，例如 http://127.0.0.1:7897'); }
    if (!['http:', 'https:', 'socks4:', 'socks5:'].includes(url.protocol) || !url.hostname ||
        url.username || url.password || url.pathname !== '/' && url.pathname !== '' || url.search || url.hash) {
      throw new Error('代理仅支持 HTTP / HTTPS / SOCKS4 / SOCKS5 地址，不支持账号、密码或路径');
    }
    proxyUrl = url.origin;
    // URL.origin is "null" for SOCKS schemes.
    if (proxyUrl === 'null') proxyUrl = `${url.protocol}//${url.host}`;
  }
  return { proxyMode, proxyUrl };
}

const sessions = new Map();
function getNetworkSession(raw) {
  const config = normalizeProxy(raw);
  const key = JSON.stringify(config);
  if (!sessions.has(key)) {
    const promise = (async () => {
      const ses = session.fromPartition(`ai-network-${sessions.size}`, { cache: false });
      await ses.setProxy(config.proxyMode === 'manual'
        ? { mode: 'fixed_servers', proxyRules: config.proxyUrl, proxyBypassRules: '<-loopback>' }
        : { mode: config.proxyMode });
      return ses;
    })();
    sessions.set(key, promise);
    promise.catch(() => sessions.delete(key));
  }
  return sessions.get(key);
}

function apiBase(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Base URL 必须是 HTTP 或 HTTPS 地址，不能含账号、查询参数或片段');
  }
  return url.href.replace(/\/+$/, '');
}

module.exports = { normalizeProxy, getNetworkSession, apiBase };
