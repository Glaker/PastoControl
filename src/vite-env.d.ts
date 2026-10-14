/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Versión de la app (fecha y hora UTC del build, ej.: 20261013.201530). */
declare const __APP_VERSION__: string;
