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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readSettings: () => Promise<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    writeSettings: (settings: any) => Promise<boolean>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readChains: () => Promise<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    writeChains: (chains: any) => Promise<boolean>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readRpcs: () => Promise<any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    writeRpcs: (rpcs: any) => Promise<boolean>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readContracts: () => Promise<any>;
    openExternal: (url: string) => Promise<boolean>;
  };
}

