import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
export async function GET(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    return NextResponse.json(
      { error: "Link inválido ou expirado." },
      { status: 404 },
    );
  const c = await prisma.container.findFirst({
    where: {
      customerTrackingHash: createHash("sha256").update(token).digest("hex"),
      customerTrackingExpiresAt: { gt: new Date() },
    },
    select: {
      code: true,
      status: true,
      origin: true,
      destination: true,
      gateEnteredAt: true,
      departedAt: true,
      estimatedArrivalAt: true,
      updatedAt: true,
    },
  });
  if (!c)
    return NextResponse.json(
      { error: "Link inválido ou expirado." },
      { status: 404 },
    );
  return NextResponse.json(c, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
