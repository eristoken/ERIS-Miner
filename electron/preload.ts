import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  loadChains: () => ipcRenderer.invoke('load-chains'),
  loadRpcs: () => ipcRenderer.invoke('load-rpcs'),
  saveRpcs: (rpcs: any) => ipcRenderer.invoke('save-rpcs', rpcs),
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  saveSettings: (settings: any) => ipcRenderer.invoke('save-settings', settings),
  startMining: (settings: any) => ipcRenderer.invoke('start-mining', settings),
  stopMining: () => ipcRenderer.invoke('stop-mining'),
  getMiningStatus: () => ipcRenderer.invoke('get-mining-status'),
  clearLogs: () => ipcRenderer.invoke('clear-logs'),
  onMiningStats: (callback: (stats: any) => void) => {
    ipcRenderer.on('mining-stats', (_event, stats) => callback(stats));
  },
  removeMiningStatsListener: () => {
    ipcRenderer.removeAllListeners('mining-stats');
  },
});

