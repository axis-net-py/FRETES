import type { CapacitorConfig } from "@capacitor/cli";

/**
 * O app nativo carrega a mesma aplicação Next.js servida pelo backend.
 * Defina CAPACITOR_SERVER_URL com a URL pública (https) antes de rodar
 * `npx cap sync`.
 */
const serverUrl = process.env.CAPACITOR_SERVER_URL;

const config: CapacitorConfig = {
  appId: "com.containertrack.app",
  appName: "Container Track",
  webDir: "public",
  ...(serverUrl ? { server: { url: serverUrl, cleartext: false } } : {}),
  plugins: {
    Geolocation: {
      permissions: ["location"],
    },
  },
};

export default config;
