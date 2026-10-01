import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";
import { adminRequestError } from "@/lib/admin-request";
import { processPosition } from "@/lib/geofence-engine";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const unauthorized = await adminRequestError(req);
  if (unauthorized) return unauthorized;
  const { id } = await params;

  try {
    const container = await prisma.container.findUnique({
      where: { id },
      select: { id: true, driverId: true },
    });
    if (!container)
      return NextResponse.json(
        { error: "Frete não encontrado." },
        { status: 404 },
      );
    if (!container.driverId)
      return NextResponse.json(
        { error: "Frete sem motorista vinculado." },
        { status: 422 },
      );

    // Reset journey state so historical positions can be re-evaluated
    await prisma.$transaction(async (tx) => {
      await tx.geofenceEvent.deleteMany({ where: { containerId: id } });
      await tx.container.update({
        where: { id },
        data: {
          gateEnteredAt: null,
          exitCandidateAt: null,
          lastGeofenceFixAt: null,
          status: "EM_TRANSITO",
        },
      });
    });

    const driverId = container.driverId;

    // Fetch all historical positions for this driver, oldest first
    const positions = await prisma.position.findMany({
      where: { driverId, source: "GLOBALSAT" },
      orderBy: { recordedAt: "asc" },
      select: {
        latitude: true,
        longitude: true,
        recordedAt: true,
        accuracyM: true,
        externalId: true,
      },
    });

    let reprocessed = 0;
    for (const pos of positions) {
      await processPosition(
        {
          driverId,
          containerId: id,
          latitude: pos.latitude,
          longitude: pos.longitude,
          accuracyM: pos.accuracyM ?? 50,
          recordedAt: pos.recordedAt.toISOString(),
        },
        { source: "GLOBALSAT", externalId: pos.externalId || undefined },
      );
      reprocessed++;
    }

    return NextResponse.json({ reprocessed, total: positions.length });
  } catch (error) {
    return apiError(error);
  }
}
