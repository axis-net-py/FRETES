import { distanceMeters } from "./geo";
import { notifyStatusChange } from "./notifications";
import { prisma } from "./prisma";
import { ContainerStatus, isContainerStatus } from "./status";

export type PositionInput = {
  driverId: string;
  containerId?: string;
  latitude: number;
  longitude: number;
  accuracyM?: number;
};

export type GeofenceTrigger = {
  geofenceId: string;
  geofenceName: string;
  containerId: string;
  containerCode: string;
  status: ContainerStatus;
  notified: boolean;
};

function exitBufferMeters(): number {
  const parsed = Number(process.env.GEOFENCE_EXIT_BUFFER_M);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 100;
}

async function containersForPosition(input: PositionInput) {
  return prisma.container.findMany({
    where: input.containerId
      ? { id: input.containerId }
      : { driverId: input.driverId, status: { not: "ENTREGUE" } },
    include: { client: true },
  });
}

export async function processPosition(input: PositionInput): Promise<GeofenceTrigger[]> {
  await prisma.position.create({
    data: {
      driverId: input.driverId,
      containerId: input.containerId,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracyM: input.accuracyM,
    },
  });

  const [geofences, containers] = await Promise.all([
    prisma.geofence.findMany({ where: { active: true } }),
    containersForPosition(input),
  ]);

  const triggers: GeofenceTrigger[] = [];

  for (const geofence of geofences) {
    const distance = distanceMeters(input, geofence);
    const inside = distance <= geofence.radiusM;
    const outside = distance > geofence.radiusM + exitBufferMeters();
    if (!inside && !outside) continue;

    for (const container of containers) {
      const lastEvent = await prisma.geofenceEvent.findFirst({
        where: { geofenceId: geofence.id, containerId: container.id },
        orderBy: { createdAt: "desc" },
      });

      if (inside) {
        if (lastEvent?.type === "ENTER") continue;

        await prisma.geofenceEvent.create({
          data: {
            geofenceId: geofence.id,
            containerId: container.id,
            type: "ENTER",
            latitude: input.latitude,
            longitude: input.longitude,
          },
        });

        const status = isContainerStatus(geofence.status) ? geofence.status : "CHEGADA_PORTAO";

        if (container.status !== status) {
          await prisma.container.update({ where: { id: container.id }, data: { status } });
        }

        const notification = await notifyStatusChange({
          containerId: container.id,
          containerCode: container.code,
          status,
          clientName: container.client.name,
          clientWhatsapp: container.client.whatsapp,
          location: geofence.name,
        });

        triggers.push({
          geofenceId: geofence.id,
          geofenceName: geofence.name,
          containerId: container.id,
          containerCode: container.code,
          status,
          notified: notification.status === "SENT",
        });
      } else if (lastEvent?.type === "ENTER") {
        await prisma.geofenceEvent.create({
          data: {
            geofenceId: geofence.id,
            containerId: container.id,
            type: "EXIT",
            latitude: input.latitude,
            longitude: input.longitude,
          },
        });
      }
    }
  }

  return triggers;
}
