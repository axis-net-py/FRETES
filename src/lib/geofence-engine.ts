import { randomBytes, createHash } from "node:crypto";
import { reliableInside, reliableOutside } from "./geofence-policy";
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
export type PositionSource = "DEVICE" | "GLOBALSAT";
export type ProcessPositionOptions = {
  source?: PositionSource;
  externalId?: string;
};
export function validPositionTime(
  recordedAt: string,
  source: PositionSource,
  now = Date.now(),
) {
  const time = new Date(recordedAt).getTime();
  const age = now - time;
  return (
    Number.isFinite(age) &&
    age >= -30000 &&
    (source === "GLOBALSAT" || age <= 120000)
  );
}
export async function processPosition(
  input: PositionInput,
  options: ProcessPositionOptions = {},
) {
  const source = options.source || "DEVICE";
  const fixAt = new Date(input.recordedAt);
  if (!validPositionTime(input.recordedAt, source)) return [];
  const outcome = await prisma.$transaction(
    async (tx) => {
      // Serialize fixes so concurrent, repeated or out-of-order samples cannot confirm a false exit.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.containerId}))`;
      const c = await tx.container.findFirst({
        where: { id: input.containerId, driverId: input.driverId },
        include: { client: true },
      });
      if (!c) throw new Error("Frete não vinculado ao motorista");
      if (
        options.externalId &&
        (await tx.position.findFirst({
          where: { source, externalId: options.externalId },
          select: { id: true },
        }))
      )
        return null;
      if (c.status === "ENTREGUE") return null;
      if (c.lastGeofenceFixAt && fixAt <= c.lastGeofenceFixAt) return null;
      if (c.departedAt || c.status === "A_CAMINHO_DESTINO") {
        await tx.position.create({
          data: {
            ...input,
            recordedAt: fixAt,
            source,
            externalId: options.externalId,
          },
        });
        await tx.container.update({
          where: { id: c.id },
          data: { lastGeofenceFixAt: fixAt },
        });
        return null;
      }
      const gate = c.geofenceId
        ? await tx.geofence.findUnique({ where: { id: c.geofenceId } })
        : null;
      if (!gate?.active) return null;
      await tx.position.create({
        data: {
          ...input,
          recordedAt: fixAt,
          source,
          externalId: options.externalId,
        },
      });
      const inside = reliableInside(input, gate),
        outside = reliableOutside(input, gate);
      const common = { lastGeofenceFixAt: fixAt };
      if (inside) {
        await tx.container.update({
          where: { id: c.id },
          data: {
            ...common,
            exitCandidateAt: null,
            gateEnteredAt: c.gateEnteredAt || fixAt,
            ...(c.status === "EM_TRANSITO" ? { status: "CHEGADA_PORTAO" } : {}),
          },
        });
        if (!c.gateEnteredAt) {
          await tx.geofenceEvent.upsert({
            where: {
              geofenceId_containerId_type: {
                geofenceId: gate.id,
                containerId: c.id,
                type: "ENTER",
              },
            },
            update: {},
            create: {
              geofenceId: gate.id,
              containerId: c.id,
              type: "ENTER",
              latitude: input.latitude,
              longitude: input.longitude,
              createdAt: fixAt,
            },
          });
          return {
            status: "CHEGADA_PORTAO",
            gate,
            containerId: c.id,
            code: c.code,
            notificationId: null,
          };
        }
        return null;
      }
      if (!outside || !c.gateEnteredAt) {
        await tx.container.update({
          where: { id: c.id },
          data: { ...common, exitCandidateAt: null },
        });
        return null;
      }
      const elapsed = c.exitCandidateAt
        ? fixAt.getTime() - c.exitCandidateAt.getTime()
        : 0;
      if (
        !c.exitCandidateAt ||
        !c.lastGeofenceFixAt ||
        fixAt.getTime() - c.lastGeofenceFixAt.getTime() > 120000
      ) {
        await tx.container.update({
          where: { id: c.id },
          data: { ...common, exitCandidateAt: fixAt },
        });
        return null;
      }
      if (elapsed < 30000) {
        await tx.container.update({ where: { id: c.id }, data: common });
        return null;
      }
      const departedAt = c.exitCandidateAt;
      const eta = c.transitHours
        ? new Date(departedAt.getTime() + c.transitHours * 3600000)
        : null;
      const token = randomBytes(32).toString("hex");
      const link = `${(process.env.APP_URL || "https://fretes-taupe.vercel.app").replace(/\/$/, "")}/acompanhar#${token}`;
      await tx.container.update({
        where: { id: c.id },
        data: {
          ...common,
          status: "A_CAMINHO_DESTINO",
          departedAt,
          estimatedArrivalAt: eta,
          exitCandidateAt: null,
          customerTrackingHash: createHash("sha256")
            .update(token)
            .digest("hex"),
          customerTrackingExpiresAt: new Date(Date.now() + 30 * 86400000),
        },
      });
      await tx.geofenceEvent.create({
        data: {
          geofenceId: gate.id,
          containerId: c.id,
          type: "EXIT",
          latitude: input.latitude,
          longitude: input.longitude,
          createdAt: departedAt,
        },
      });
      const etaText = eta
        ? eta.toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            dateStyle: "short",
            timeStyle: "short",
          }) + " (horário de Brasília; estimativa)"
        : "A confirmar pela transportadora";
      const parameters = [
        c.client.name,
        c.code,
        "Saiu da área do portão e iniciou o trajeto",
        c.destination || "Destino a confirmar",
        etaText,
        link,
      ];
      const n = await tx.notification.create({
        data: {
          containerId: c.id,
          to: c.client.whatsapp,
          kind: "DEPARTURE",
          parameters: JSON.stringify(parameters),
          body: `Olá ${parameters[0]}, seu container ${parameters[1]} saiu da área do portão de saída. Destino: ${parameters[3]}. Previsão: ${parameters[4]}. Acompanhe: ${link}`,
          provider: process.env.WHATSAPP_PROVIDER || "disabled",
          status:
            c.client.consent && !!c.client.whatsapp ? "PENDING" : "NO_CONSENT",
          error:
            c.client.consent && !!c.client.whatsapp
              ? null
              : "WhatsApp ou autorização do cliente pendente.",
        },
      });
      return {
        status: "A_CAMINHO_DESTINO",
        gate,
        containerId: c.id,
        code: c.code,
        notificationId: n.id,
      };
    },
    { maxWait: 10000, timeout: 15000 },
  );
  if (!outcome) return [];
  const sent = outcome.notificationId
    ? await dispatchNotification(outcome.notificationId)
    : null;
  return [
    {
      geofenceId: outcome.gate.id,
      geofenceName: outcome.gate.name,
      containerId: outcome.containerId,
      containerCode: outcome.code,
      status: outcome.status,
      notified: sent?.status === "ACCEPTED",
      notificationStatus: sent?.status,
    },
  ];
}
