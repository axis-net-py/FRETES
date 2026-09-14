import { NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = randomBytes(32).toString("hex");
  const updated = await prisma.container.updateMany({
    where: { id, departedAt: { not: null } },
    data: {
      customerTrackingHash: createHash("sha256").update(token).digest("hex"),
      customerTrackingExpiresAt: new Date(Date.now() + 30 * 86400000),
    },
  });
  if (!updated.count)
    return NextResponse.json(
      { error: "Frete não encontrado." },
      { status: 404 },
    );
  return NextResponse.json({
    url: `${new URL(req.url).origin}/acompanhar#${token}`,
  });
}
