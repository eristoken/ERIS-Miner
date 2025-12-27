import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  readSettings: () => ipcRenderer.invoke('read-settings'),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  writeSettings: (settings: any) => ipcRenderer.invoke('write-settings', settings),
  readChains: () => ipcRenderer.invoke('read-chains'),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  writeChains: (chains: any) => ipcRenderer.invoke('write-chains', chains),
  readRpcs: () => ipcRenderer.invoke('read-rpcs'),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  writeRpcs: (rpcs: any) => ipcRenderer.invoke('write-rpcs', rpcs),
  readContracts: () => ipcRenderer.invoke('read-contracts'),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
});

