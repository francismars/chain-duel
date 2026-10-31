/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SOCKET_URL?: string;
  readonly VITE_PROXY_TARGET?: string;
  /** Set to `true` to ship `/preview` labs and the debug menu in a production build. */
  readonly VITE_ENABLE_PREVIEW?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
