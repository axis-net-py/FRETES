import { createHash } from "node:crypto";
import { prisma } from "./prisma";
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function trackingContainer(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return prisma.container.findFirst({
    where: {
      trackingTokenHash: hashToken(token),
      trackingExpiresAt: { gt: new Date() },
      status: { not: "ENTREGUE" },
    },
    include: { driver: true },
  });
}
