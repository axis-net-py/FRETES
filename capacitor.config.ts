import type { CapacitorConfig } from "@capacitor/cli";
const url = process.env.CAPACITOR_SERVER_URL;
if (url && !url.startsWith("https://"))
  throw new Error("CAPACITOR_SERVER_URL must use HTTPS.");
const config: CapacitorConfig = {
  appId: "py.axisnet.fretes",
  appName: "AXIS Fretes",
  webDir: "mobile-shell",
  ...(url ? { server: { url, cleartext: false } } : {}),
};
export default config;
