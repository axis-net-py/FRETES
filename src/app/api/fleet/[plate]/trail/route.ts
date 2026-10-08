import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePlate } from "@/lib/fleet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ plate: string }> },
) {
  const { plate: rawPlate } = await params;
  const plate = normalizePlate(rawPlate || "");

  if (!plate) {
    return NextResponse.json({ error: "Placa não informada." }, { status: 400 });
  }

  // 1. Find driver with this plate
  const driver = await prisma.driver.findFirst({
    where: {
      plate: {
        contains: plate,
        mode: "insensitive",
      },
    },
    select: { id: true, name: true, phone: true, plate: true },
  });

  // 2. Find active container for this truck or driver
  const activeContainer = await prisma.container.findFirst({
    where: {
      OR: [
        { truckPlate: { contains: plate, mode: "insensitive" } },
        ...(driver ? [{ driverId: driver.id }] : []),
      ],
      status: { not: "ENTREGUE" },
    },
    orderBy: { updatedAt: "desc" },
    include: {
      client: { select: { name: true } },
    },
  });

  // 3. Find historical container if no active container
  const latestContainer =
    activeContainer ||
    (await prisma.container.findFirst({
      where: {
        OR: [
          { truckPlate: { contains: plate, mode: "insensitive" } },
          ...(driver ? [{ driverId: driver.id }] : []),
        ],
      },
      orderBy: { updatedAt: "desc" },
      include: {
        client: { select: { name: true } },
      },
    }));

  // 4. Query up to 60 recent positions
  const positions = await prisma.position.findMany({
    where: {
      OR: [
        ...(driver ? [{ driverId: driver.id }] : []),
        ...(latestContainer ? [{ containerId: latestContainer.id }] : []),
      ],
    },
    orderBy: { recordedAt: "desc" },
    take: 60,
    select: {
      id: true,
      latitude: true,
      longitude: true,
      recordedAt: true,
      source: true,
    },
  });

  // Chronological order for drawing polyline
  const trail = [...positions].reverse();
  const current = positions[0] || null;

  // 5. Origin coordinates (Port of Paranaguá)
  const portGeofence = await prisma.geofence.findFirst({
    where: { kind: "PORT_EXIT", active: true },
    select: { name: true, latitude: true, longitude: true, radiusM: true },
  });

  const origin = portGeofence || {
    name: "Porto de Paranaguá",
    latitude: -25.5005,
    longitude: -48.5135,
    radiusM: 500,
  };

  // 6. Destination coordinates matching
  let destinationGeofence = null;
  if (latestContainer?.destination) {
    const destText = latestContainer.destination.toUpperCase();
    const allDestGeofences = await prisma.geofence.findMany({
      where: { kind: "DESTINATION", active: true },
      select: { id: true, name: true, latitude: true, longitude: true, radiusM: true },
    });

    destinationGeofence =
      allDestGeofences.find((g) =>
        destText.includes(g.name.toUpperCase()),
      ) || null;
  }

  const destination = destinationGeofence
    ? {
        name: destinationGeofence.name,
        latitude: destinationGeofence.latitude,
        longitude: destinationGeofence.longitude,
        radiusM: destinationGeofence.radiusM,
      }
    : latestContainer?.destination
      ? {
          name: latestContainer.destination,
          latitude: null,
          longitude: null,
          radiusM: null,
        }
      : null;

  return NextResponse.json({
    truckPlate: plate,
    driver: driver ? { name: driver.name, phone: driver.phone } : null,
    container: latestContainer
      ? {
          code: latestContainer.code,
          status: latestContainer.status,
          origin: latestContainer.origin,
          destination: latestContainer.destination,
        }
      : null,
    current,
    trail,
    origin,
    destination,
  });
}

