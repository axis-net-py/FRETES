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
    const url = new URL(req.url);
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");
    const fromDate = fromParam ? new Date(fromParam) : undefined;
    const toDate = toParam ? new Date(toParam) : undefined;

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

    // Reset journey state so historical positions can be re-evaluated.
    // Unsent notifications are discarded (they regenerate); already
    // accepted ones are kept as history.
    await prisma.$transaction(async (tx) => {
      await tx.geofenceEvent.deleteMany({
        where: {
          containerId: id,
          ...(fromDate ? { createdAt: { gte: fromDate } } : {}),
        },
      });
      await tx.notification.deleteMany({
        where: {
          containerId: id,
          status: { in: ["PENDING", "FAILED", "UNCONFIGURED", "SENDING"] },
          ...(fromDate ? { createdAt: { gte: fromDate } } : {}),
        },
      });
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

    // Fetch historical positions for this driver, oldest first
    const positions = await prisma.position.findMany({
      where: {
        driverId,
        source: "GLOBALSAT",
        ...(fromDate || toDate
          ? {
              recordedAt: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lte: toDate } : {}),
              },
            }
          : {}),
      },
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
    const outcomes: unknown[] = [];
    for (const pos of positions) {
      const outcome = await processPosition(
        {
          driverId,
          containerId: id,
          latitude: pos.latitude,
          longitude: pos.longitude,
          accuracyM: pos.accuracyM ?? 50,
          recordedAt: pos.recordedAt.toISOString(),
        },
        { source: "GLOBALSAT", replay: true },
      );
      if (outcome && outcome.length > 0) {
        outcomes.push(...outcome);
      }
      reprocessed++;
    }

    return NextResponse.json({ reprocessed, total: positions.length, outcomes });
  } catch (error) {
    return apiError(error);
  }
}
