/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_LOCAL_DEV?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** vite `define`으로 빌드타임에 박히는 대시보드 자신의 버전(package.json에서 읽음). */
declare const __DASHBOARD_VERSION__: string;
