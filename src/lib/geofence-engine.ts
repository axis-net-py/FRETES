import { Prisma } from "@prisma/client";
import { reliableInside } from "./geofence-policy";
import { prisma } from "./prisma";
import { dispatchNotification } from "./notifications";

export type PositionInput = {
  driverId: string;
  containerId: string;
  latitude: number;
  longitude: number;
  accuracyM: number;
  recordedAt: string;
};
export async function processPosition(input: PositionInput) {
  const container = await prisma.container.findFirst({
    where: { id: input.containerId, driverId: input.driverId },
    include: { client: true },
  });
  if (!container) throw new Error("Frete não vinculado ao motorista");
  if (container.status !== "EM_TRANSITO") return [];
  const gate = container.geofenceId
    ? await prisma.geofence.findUnique({ where: { id: container.geofenceId } })
    : null;
  if (!gate?.active) return [];
  const age = Date.now() - new Date(input.recordedAt).getTime();
  if (!Number.isFinite(age) || age > 120000 || age < -30000) return [];
  await prisma.position.create({
    data: { ...input, recordedAt: new Date(input.recordedAt) },
  });
  if (!reliableInside(input, gate)) return [];
  let notificationId: string | undefined;
  try {
    notificationId = await prisma.$transaction(
      async (tx) => {
        // Compare-and-set prevents concurrent fixes from triggering duplicate messages.
        const claimed = await tx.container.updateMany({
          where: { id: container.id, status: "EM_TRANSITO" },
          data: { status: "CHEGADA_PORTAO" },
        });
        if (!claimed.count) return undefined;
        await tx.geofenceEvent.create({
          data: {
            geofenceId: gate.id,
            containerId: container.id,
            type: "ENTER",
            latitude: input.latitude,
            longitude: input.longitude,
          },
        });
        const parameters = [
          container.client.name,
          container.code,
          "Chegou ao portão de liberação",
          gate.name,
        ];
        const n = await tx.notification.create({
          data: {
            containerId: container.id,
            to: container.client.whatsapp,
            body: `Olá ${parameters[0]}, seu container ${parameters[1]} chegou ao portão de liberação em ${parameters[3]}.`,
            parameters: JSON.stringify(parameters),
            provider: process.env.WHATSAPP_PROVIDER || "disabled",
            status: container.client.consent ? "PENDING" : "NO_CONSENT",
            error: container.client.consent
              ? null
              : "Cliente não autorizou avisos por WhatsApp.",
          },
        });
        return n.id;
      },
      { maxWait: 10000, timeout: 15000 },
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return [];
    throw e;
  }
  if (!notificationId) return [];
  const result = await dispatchNotification(notificationId);
  return [
    {
      geofenceId: gate.id,
      geofenceName: gate.name,
      containerId: container.id,
      containerCode: container.code,
      status: "CHEGADA_PORTAO",
      notified: result?.status === "ACCEPTED",
      notificationStatus: result?.status,
    },
  ];
}
