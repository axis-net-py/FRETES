import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

export function validSyncSecret(input: Request | string | null) {
  const configured = process.env.GLOBALSAT_SYNC_SECRET;
  const cronSecret = process.env.CRON_SECRET;
  const validSecrets = [configured, cronSecret].filter(
    (s): s is string => typeof s === "string" && s.length >= 16,
  );
  if (validSecrets.length === 0) return false;

  let supplied: string | null = null;
  if (typeof input === "string") {
    if (input.startsWith("Bearer ")) supplied = input.slice("Bearer ".length);
    else supplied = input;
  } else if (input && typeof input === "object" && "headers" in input) {
    const authHeader = input.headers.get("authorization");
    const xSyncHeader = input.headers.get("x-sync-secret");
    let querySecret: string | null = null;
    try {
      const url = new URL(input.url);
      querySecret = url.searchParams.get("secret");
    } catch {
      querySecret = null;
    }

    if (authHeader?.startsWith("Bearer ")) {
      supplied = authHeader.slice("Bearer ".length);
    } else if (xSyncHeader) {
      supplied = xSyncHeader;
    } else if (querySecret) {
      supplied = querySecret;
    }
  }

  if (!supplied || supplied.length < 16) return false;
  const suppliedDigest = digest(supplied);
  return validSecrets.some(
    (sec) => supplied!.length === sec.length && timingSafeEqual(suppliedDigest, digest(sec)),
  );
}
