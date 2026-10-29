/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origem da API (D73); opcional em dev, obrigatória no build de produção. */
  readonly VITE_API_URL?: string;
}
