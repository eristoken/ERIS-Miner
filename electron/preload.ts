import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  readSettings: () => ipcRenderer.invoke('read-settings'),
  writeSettings: (settings: any) => ipcRenderer.invoke('write-settings', settings),
  readChains: () => ipcRenderer.invoke('read-chains'),
  writeChains: (chains: any) => ipcRenderer.invoke('write-chains', chains),
  readRpcs: () => ipcRenderer.invoke('read-rpcs'),
  writeRpcs: (rpcs: any) => ipcRenderer.invoke('write-rpcs', rpcs),
});

