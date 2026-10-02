import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const s = await prisma.integrationState.findUnique({
  where: { provider: "GLOBALSAT" },
  select: { lastSucceededAt: true, lastStartedAt: true, lastError: true, lastSummary: true, lockedUntil: true, cursor: true },
});
const sum = s?.lastSummary as { status?: string; nextCursor?: string; previousCursor?: string; processedPositions?: number } | null;
console.log(JSON.stringify({ ok: s?.lastSucceededAt, started: s?.lastStartedAt, err: s?.lastError, lock: s?.lockedUntil, cursor: String(s?.cursor), sum }, null, 1));
await prisma.$disconnect();
