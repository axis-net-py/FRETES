import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const events = await prisma.geofenceEvent.findMany({
  orderBy: { createdAt: "desc" },
  take: 12,
  select: {
    type: true, createdAt: true, latitude: true, longitude: true,
    container: { select: { code: true, status: true } },
    geofence: { select: { name: true, kind: true, notifyOnEnter: true } },
  },
});
for (const e of events)
  console.log(e.createdAt.toISOString(), e.geofence.kind, e.type, e.container.code, e.container.status);
const notes = await prisma.notification.findMany({
  orderBy: { createdAt: "desc" },
  take: 6,
  select: { kind: true, status: true, createdAt: true, container: { select: { code: true } } },
});
console.log("---NOTES---");
for (const n of notes)
  console.log(n.createdAt.toISOString(), n.kind, n.status, n.container.code);
await prisma.$disconnect();
