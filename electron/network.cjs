// Use Chromium's network stack: Node's global fetch does not follow the
// operating system's proxy/PAC configuration.
function fetchWithSystemProxy(net, url, options = {}, timeoutMs = 120000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const response = Promise.resolve().then(() =>
    net.fetch(url, { ...options, signal: controller.signal }));
  // Keep the deadline active while the streaming response is being consumed.
  return { response, dispose: () => clearTimeout(timer), signal: controller.signal };
}

function networkError(error, timedOut = false) {
  if (timedOut) return 'AI 请求超时（120 秒），请检查网络、系统代理或稍后重试。';
  const detail = [error?.message, error?.cause?.code, error?.cause?.message]
    .filter(Boolean).join('；');
  if (/fetch failed|net::ERR_|ENOTFOUND|ECONN|ETIMEDOUT|EAI_AGAIN|certificate/i.test(detail)) {
    return `AI 网络连接失败：${detail}。${/ERR_CONNECTION_CLOSED/.test(detail) ? '连接被服务端或代理中途关闭。' : ''}请在设置中检测代理、填写 HTTP / SOCKS 代理地址并测试连接，也可切换直连排查。`;
  }
  return detail || '流式请求失败';
}

module.exports = { fetchWithSystemProxy, networkError };
