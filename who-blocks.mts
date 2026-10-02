import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const { journeyTarget } = await import("./src/lib/journey");
const { reliableInside, reliableOutside } = await import("./src/lib/geofence-policy");
const { distanceMeters } = await import("./src/lib/geo");

const gates = await prisma.geofence.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } });
const trips = await prisma.container.findMany({
  where: { status: { in: ["EM_TRANSITO", "CHEGADA_PORTAO", "A_CAMINHO_DESTINO"] }, driverId: { not: null } },
  select: { id: true, code: true, status: true, driverId: true, gateEnteredAt: true },
});

for (const t of trips) {
  const events = await prisma.geofenceEvent.findMany({
    where: { containerId: t.id },
    select: { geofenceId: true, type: true },
  });
  const gate = journeyTarget(gates, events, t.code);
  if (!gate) continue;
  const fix = await prisma.position.findFirst({
    where: { driverId: t.driverId, source: "GLOBALSAT" },
    orderBy: { recordedAt: "desc" },
    select: { latitude: true, longitude: true, recordedAt: true, accuracyM: true },
  });
  if (!fix) continue;
  const input = { latitude: fix.latitude, longitude: fix.longitude, accuracyM: fix.accuracyM ?? 50, recordedAt: fix.recordedAt.toISOString() };
  const now = fix.recordedAt.getTime() + 30000;
  const inside = reliableInside(input, gate, now);
  const dist = Math.round(distanceMeters(fix, gate));
  const existing = events.filter((e) => e.geofenceId === gate.id).map((e) => e.type).join(",");
  console.log(t.code, t.status, "| target:", gate.kind, "| dist:", dist + "m", "| inside:", inside, "| enteredAt:", !!t.gateEnteredAt, "| existing:", existing || "none", "| fix:", fix.recordedAt.toISOString());
}
await prisma.$disconnect();
