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

