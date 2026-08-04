/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_ENABLE_API_MOCKS?: 'false' | 'true';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
