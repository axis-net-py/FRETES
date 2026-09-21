import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { prisma } from "./prisma";

// Persist encrypted tokens so serverless invocations reuse the 24-hour token.
export function globalSatTokenStore(clientId: string, clientSecret: string) {
  const fingerprint = createHash("sha256")
    .update(clientId + ":" + clientSecret)
    .digest("hex");
  function key() {
    const secret = process.env.SESSION_SECRET;
    if (!secret) throw new Error("Token encryption unavailable");
    return createHash("sha256")
      .update("globalsat:" + secret)
      .digest();
  }
  return {
    async load() {
      const state = await prisma.integrationState.findUnique({
        where: { provider: "GLOBALSAT" },
      });
      if (
        !state?.encryptedToken ||
        state.credentialFingerprint !== fingerprint ||
        !state.tokenExpiresAt ||
        state.tokenExpiresAt.getTime() <= Date.now()
      )
        return null;
      try {
        const [iv, tag, body] = state.encryptedToken
          .split(".")
          .map((v) => Buffer.from(v, "base64"));
        const cipher = createDecipheriv("aes-256-gcm", key(), iv);
        cipher.setAuthTag(tag);
        const token = Buffer.concat([
          cipher.update(body),
          cipher.final(),
        ]).toString("utf8");
        return { token, expiresAt: state.tokenExpiresAt.getTime() };
      } catch {
        return null;
      }
    },
    async save(value: { token: string; expiresAt: number }) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key(), iv);
      const body = Buffer.concat([
        cipher.update(value.token, "utf8"),
        cipher.final(),
      ]);
      const data = {
        encryptedToken: [iv, cipher.getAuthTag(), body]
          .map((v) => v.toString("base64"))
          .join("."),
        tokenExpiresAt: new Date(value.expiresAt),
        credentialFingerprint: fingerprint,
      };
      await prisma.integrationState.upsert({
        where: { provider: "GLOBALSAT" },
        create: { provider: "GLOBALSAT", ...data },
        update: data,
      });
    },
  };
}
