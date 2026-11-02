const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desk', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),
  detectProxy: (baseUrl) => ipcRenderer.invoke('network:detect', baseUrl),
  testNetwork: (settings) => ipcRenderer.invoke('network:test', settings),
  streamChat: (payload) => {
    const id = crypto.randomUUID();
    ipcRenderer.send('ai:stream', { id, payload });
    return id;
  },
  onAi: (callback) => {
    const handler = (_event, message) => callback(message);
    ipcRenderer.on('ai:event', handler);
    return () => ipcRenderer.removeListener('ai:event', handler);
  },
});
