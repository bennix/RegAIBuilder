const { app, BrowserWindow, ipcMain, safeStorage } = require('electron');
const { fetchWithSystemProxy, networkError } = require('./network.cjs');
const { normalizeProxy, getNetworkSession, apiBase } = require('./proxy.cjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_BASE = 'https://zenmux.ai/api/v1';
const DEFAULT_MODEL = 'anthropic/claude-sonnet-4.6';

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function fallbackKeyPath() {
  return path.join(app.getPath('userData'), 'vault.key');
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function loadRaw() {
  return (
    readJson(settingsPath()) || {
      keyCipher: '',
      keyMethod: '',
      models: [DEFAULT_MODEL],
      activeModel: DEFAULT_MODEL,
      baseUrl: DEFAULT_BASE,
    }
  );
}

function writeRaw(data) {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(data, null, 2), { mode: 0o600 });
}

function fallbackKey() {
  const file = fallbackKeyPath();
  if (fs.existsSync(file)) return fs.readFileSync(file);
  const key = crypto.randomBytes(32);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, key, { mode: 0o600 });
  return key;
}

function encryptKey(plain) {
  if (safeStorage.isEncryptionAvailable()) {
    return {
      keyCipher: safeStorage.encryptString(plain).toString('base64'),
      keyMethod: 'safeStorage',
    };
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', fallbackKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    keyCipher: Buffer.concat([iv, tag, enc]).toString('base64'),
    keyMethod: 'aes-gcm',
  };
}

function decryptKey(raw) {
  if (!raw.keyCipher) return '';
  const buf = Buffer.from(raw.keyCipher, 'base64');
  if (raw.keyMethod === 'safeStorage') {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('系统加密不可用，无法读取已保存的密钥');
    return safeStorage.decryptString(buf);
  }
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', fallbackKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

function publicSettings(raw) {
  const cipher = raw.keyCipher || '';
  return {
    hasKey: Boolean(cipher),
    keyMask: cipher ? `enc:${cipher.slice(0, 8)}…${cipher.slice(-6)}` : '',
    models: Array.isArray(raw.models) && raw.models.length ? raw.models : [DEFAULT_MODEL],
    activeModel: raw.activeModel || DEFAULT_MODEL,
    baseUrl: raw.baseUrl || DEFAULT_BASE,
    ...normalizeProxy(raw),
    inviteUrl: 'https://zenmux.ai/invite/GBQMC5',
  };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    title: '正则排版台',
    backgroundColor: '#14160f',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

ipcMain.handle('settings:get', () => publicSettings(loadRaw()));

ipcMain.handle('settings:save', (_e, patch) => {
  const raw = loadRaw();
  Object.assign(raw, normalizeProxy({ ...raw, ...patch }));
  if (patch.baseUrl) apiBase(patch.baseUrl.trim());
  if (typeof patch.baseUrl === 'string' && patch.baseUrl.trim()) raw.baseUrl = patch.baseUrl.trim();
  if (Array.isArray(patch.models)) {
    const models = [...new Set(patch.models.map((m) => String(m).trim()).filter(Boolean))];
    raw.models = models.length ? models : [DEFAULT_MODEL];
  }
  if (typeof patch.activeModel === 'string' && patch.activeModel.trim()) {
    raw.activeModel = patch.activeModel.trim();
    if (!raw.models.includes(raw.activeModel)) raw.models.push(raw.activeModel);
  }
  if (patch.clearKey) {
    raw.keyCipher = '';
    raw.keyMethod = '';
  } else if (typeof patch.apiKey === 'string' && patch.apiKey.trim()) {
    Object.assign(raw, encryptKey(patch.apiKey.trim()));
  }
  writeRaw(raw);
  return publicSettings(raw);
});

ipcMain.handle('network:detect', async (_event, baseUrl) => {
  const ses = await getNetworkSession({ proxyMode: 'system' });
  const route = await ses.resolveProxy(apiBase(baseUrl || DEFAULT_BASE));
  const match = route.match(/(?:^|;\s*)(PROXY|HTTPS|SOCKS5|SOCKS)\s+([^;]+)/);
  const schemes = { PROXY: 'http', HTTPS: 'https', SOCKS5: 'socks5', SOCKS: 'socks4' };
  return { route, proxyUrl: match ? `${schemes[match[1]]}://${match[2].trim()}` : '' };
});

ipcMain.handle('network:test', async (_event, patch) => {
  let request;
  let route = '';
  try {
    const base = apiBase(patch.baseUrl || DEFAULT_BASE);
    const ses = await getNetworkSession(patch);
    route = await ses.resolveProxy(base);
    request = fetchWithSystemProxy(ses, `${base}/models`, {}, 15000);
    const res = await request.response;
    await res.body?.cancel();
    const ok = res.ok || res.status === 401 || res.status === 403;
    return { ok, message: `${route} · HTTP ${res.status}：${res.ok ? '网络连通（尚未验证 AI 对话）' : res.status === 401 || res.status === 403 ? '已连接服务，需在对话中验证密钥 / 权限' : '服务返回异常状态，请检查 Base URL'}` };
  } catch (error) {
    return { ok: false, message: `${route ? `${route} · ` : ''}${request?.signal.aborted ? '连接测试超时（15 秒）' : networkError(error)}` };
  } finally { request?.dispose(); }
});

ipcMain.on('ai:stream', async (event, { id, payload }) => {
  let request;
  const send = (message) => {
    if (!event.sender.isDestroyed()) event.sender.send('ai:event', { id, ...message });
  };
  try {
    const raw = loadRaw();
    const apiKey = decryptKey(raw);
    if (!apiKey) {
      send({ type: 'error', error: '还没有 API Key。请到设置页保存，或使用邀请链接领取。' });
      return;
    }
    const base = apiBase(raw.baseUrl || DEFAULT_BASE);
    const transport = await getNetworkSession(raw);
    const model = payload.model || raw.activeModel || DEFAULT_MODEL;
    request = fetchWithSystemProxy(transport, `${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        stream: true,
        messages: payload.messages,
      }),
    });
    const res = await request.response;
    if (!res.ok || !res.body) {
      const text = await res.text();
      send({ type: 'error', error: `ZenMux ${res.status}: ${text.slice(0, 500)}` });
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content || '';
          if (delta) send({ type: 'delta', delta });
        } catch {
          // 忽略不完整的数据行
        }
      }
    }
    send({ type: 'done' });
  } catch (err) {
    send({ type: 'error', error: networkError(err, request?.signal.aborted) });
  } finally {
    request?.dispose();
  }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
