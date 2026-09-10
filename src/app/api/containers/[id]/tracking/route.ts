import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/tracking";
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const c = await prisma.container.findUnique({ where: { id } });
  if (!c?.driverId || c.status === "ENTREGUE")
    return NextResponse.json(
      { error: "Vincule um motorista a um frete em andamento." },
      { status: 400 },
    );
  const token = randomBytes(32).toString("hex");
  await prisma.container.update({
    where: { id },
    data: {
      trackingTokenHash: hashToken(token),
      trackingExpiresAt: new Date(Date.now() + 7 * 86400000),
    },
  });
  return NextResponse.json({
    url: new URL("/motorista", req.url).toString() + "#token=" + token,
  });
}
