import { prisma } from "./prisma";
import { dashboardGlobalSatState } from "./globalsat-status";
import { aggregateFleet, type RawPositionFix } from "./fleet";

export async function getDashboard() {
  const [containers, clients, drivers, gates, notifications, globalSatState, latestPositions] =
    await Promise.all([
      prisma.container.findMany({
        orderBy: { updatedAt: "desc" },
        include: {
          client: true,
          documentLinks: {
            select: { document: { select: { id: true, filename: true } } },
          },
          driver: true,
          events: { orderBy: { createdAt: "desc" } },
        },
      }),
      prisma.client.findMany({ orderBy: { name: "asc" } }),
      prisma.driver.findMany({ orderBy: { name: "asc" } }),
      prisma.geofence.findMany({ orderBy: { name: "asc" } }),
      prisma.notification.findMany({
        take: 100,
        orderBy: { createdAt: "desc" },
        include: { container: { select: { code: true } } },
      }),
      prisma.integrationState.findUnique({
        where: { provider: "GLOBALSAT" },
        select: { lastSucceededAt: true, lastError: true },
      }),
      prisma.$queryRaw<RawPositionFix[]>`
        SELECT DISTINCT ON (p."driverId")
          p.id, p."driverId", p."containerId", p.latitude, p.longitude, p."recordedAt", p.source,
          d.plate as "driverPlate"
        FROM "Position" p
        JOIN "Driver" d ON p."driverId" = d.id
        WHERE p.source = 'GLOBALSAT'
        ORDER BY p."driverId", p."recordedAt" DESC
      `.catch(() => [] as RawPositionFix[]),
    ]);

  const fleet = aggregateFleet({
    containers,
    drivers,
    latestPositions,
  });
  return JSON.parse(
    JSON.stringify({
      fleet,
      containers: containers.map(({ trackingTokenHash, ...c }) => {
        void trackingTokenHash;
        return c;
      }),
      clients,
      drivers,
      gates,
      notifications,
      globalSatSync: dashboardGlobalSatState(
        globalSatState,
        !!process.env.GLOBALSAT_CLIENT_ID && !!process.env.GLOBALSAT_CLIENT_SECRET,
      ),
      whatsappReady:
        process.env.WHATSAPP_PROVIDER === "meta" &&
        !!process.env.META_WHATSAPP_TOKEN &&
        !!process.env.META_WHATSAPP_PHONE_NUMBER_ID &&
        !!process.env.META_WHATSAPP_DEPARTURE_TEMPLATE &&
        !!process.env.META_GRAPH_VERSION,
    }),
  );
}
