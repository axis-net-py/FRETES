import { prisma } from "./prisma";
export async function getDashboard() {
  const [containers, clients, drivers, gates, notifications] =
    await Promise.all([
      prisma.container.findMany({
        orderBy: { updatedAt: "desc" },
        include: {
          client: true,
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
    ]);
  return JSON.parse(
    JSON.stringify({
      containers: containers.map(({ trackingTokenHash, ...c }) => {
        void trackingTokenHash;
        return c;
      }),
      clients,
      drivers,
      gates,
      notifications,
      whatsappReady:
        process.env.WHATSAPP_PROVIDER === "meta" &&
        !!process.env.META_WHATSAPP_TOKEN &&
        !!process.env.META_WHATSAPP_PHONE_NUMBER_ID &&
        !!process.env.META_WHATSAPP_TEMPLATE &&
        !!process.env.META_GRAPH_VERSION,
    }),
  );
}
