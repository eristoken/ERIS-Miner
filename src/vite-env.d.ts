/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly APP_VERSION: string;
  readonly APP_NAME: string;
  readonly APP_DESCRIPTION: string;
  readonly APP_LICENSE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  electronAPI: {
    readSettings: () => Promise<any>;
    writeSettings: (settings: any) => Promise<boolean>;
    readChains: () => Promise<any>;
    writeChains: (chains: any) => Promise<boolean>;
    readRpcs: () => Promise<any>;
    writeRpcs: (rpcs: any) => Promise<boolean>;
    readContracts: () => Promise<any>;
    openExternal: (url: string) => Promise<boolean>;
  };
}

