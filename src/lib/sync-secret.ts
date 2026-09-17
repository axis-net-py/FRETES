import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

export function validSyncSecret(authorization: string | null) {
  const configured = process.env.GLOBALSAT_SYNC_SECRET;
  if (!configured || configured.length < 32 || !authorization?.startsWith("Bearer "))
    return false;
  const supplied = authorization.slice("Bearer ".length);
  return timingSafeEqual(digest(supplied), digest(configured));
}
