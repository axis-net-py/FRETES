import { randomBytes, createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { distanceMeters } from "./geo";
import { reliableInside, reliableOutside, returningToGate } from "./geofence-policy";
import {
  gateCompleted,
  journeyGatesFor,
  journeyTarget,
  notificationKindFor,
  eventMessage,
  formatUpdateMessage,
  isContainerCode,
} from "./journey";
import { prisma } from "./prisma";
import { dispatchNotification } from "./notifications";

type CheckpointContainer = {
  id: string;
  code: string;
  status: string;
  destination: string | null;
  geofenceId?: string | null;
  transitHours: number | null;
  estimatedArrivalAt: Date | null;
  gateEnteredAt?: Date | null;
  exitCandidateAt?: Date | null;
  client: { name: string; whatsapp: string; consent: boolean };
  driver: { name: string } | null;
  truckPlate: string | null;
  trailerPlate: string | null;
  seal: string | null;
  cargoDescription?: string | null;
};

type CheckpointOutcome = {
  status: string;
  gate: { id: string; name: string };
  containerId: string;
  code: string;
  notificationId: string | null;
};

async function latestTrackingLink(
  tx: Prisma.TransactionClient,
  containerId: string,
) {
  const previous = await tx.notification.findFirst({
    where: { containerId, kind: "DEPARTURE" },
    orderBy: { createdAt: "desc" },
    select: { parameters: true },
  });
  try {
    const parsed = JSON.parse(previous?.parameters || "") as unknown;
    return Array.isArray(parsed) && typeof parsed[5] === "string"
      ? parsed[5]
      : "";
  } catch {
    return "";
  }
}

async function notifyCheckpoint(
  tx: Prisma.TransactionClient,
  args: {
    gate: { id: string; name: string; kind: string };
    event: "ENTER" | "EXIT";
    at: Date;
    input: PositionInput;
    container: CheckpointContainer;
  },
): Promise<CheckpointOutcome> {
  const { gate, event, at, input, container: c } = args;
  const kind = notificationKindFor(gate.kind, event);
  const msg = eventMessage(kind, at);
  const plates = [c.truckPlate, c.trailerPlate].filter(Boolean).join(" / ");
  const crewLine = c.driver?.name
    ? `${c.driver.name} com caminhão ${plates}`
    : plates;
  let link = "";
  const departedAt = at;
  let estimatedArrivalAt = c.estimatedArrivalAt;
  // TPC (PORT_EXIT) serves containers, APPA serves loose cargo; both
  // confirm departure the same way.
  const isPortDeparture =
    (gate.kind === "PORT_EXIT" || gate.kind === "APPA") && event === "EXIT";
  const isDestinationExit =
    gate.kind === "DESTINATION" && event === "EXIT";
  if (isPortDeparture) {
    estimatedArrivalAt = c.transitHours
      ? new Date(at.getTime() + c.transitHours * 3600000)
      : null;
    const token = randomBytes(32).toString("hex");
    link = `${(process.env.APP_URL || "https://axis-fretes.vercel.app").replace(/\/$/, "")}/acompanhar#${token}`;
    await tx.container.update({
      where: { id: c.id },
      data: {
        status: "A_CAMINHO_DESTINO",
        departedAt,
        estimatedArrivalAt,
        exitCandidateAt: null,
        gateEnteredAt: null,
        customerTrackingHash: createHash("sha256")
          .update(token)
          .digest("hex"),
        customerTrackingExpiresAt: new Date(Date.now() + 30 * 86400000),
      },
    });
  } else if (isDestinationExit) {
    link = await latestTrackingLink(tx, c.id);
    await tx.container.update({
      where: { id: c.id },
      data: {
        status: "ENTREGUE",
        trackingTokenHash: null,
        trackingExpiresAt: null,
        gateEnteredAt: null,
        exitCandidateAt: null,
      },
    });
  } else if (event === "EXIT") {
    link = await latestTrackingLink(tx, c.id);
    await tx.container.update({
      where: { id: c.id },
      data: { gateEnteredAt: null, exitCandidateAt: null },
    });
  } else {
    // ENTER: preserve gateEnteredAt so the truck stays recorded as inside the gate
    link = await latestTrackingLink(tx, c.id);
    await tx.container.update({
      where: { id: c.id },
      data: {
        gateEnteredAt: c.gateEnteredAt || at,
        exitCandidateAt: null,
      },
    });
  }
  // Idempotent: the ENTER branch upserts the same row just before calling
  // here, and replays/retries must never violate the unique event key.
  await tx.geofenceEvent.upsert({
    where: {
      geofenceId_containerId_type: {
        geofenceId: gate.id,
        containerId: c.id,
        type: event,
      },
    },
    update: {},
    create: {
      geofenceId: gate.id,
      containerId: c.id,
      type: event,
      latitude: input.latitude,
      longitude: input.longitude,
      createdAt: at,
    },
  });
  const etaText = estimatedArrivalAt
    ? estimatedArrivalAt.toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "short",
      }) + " (horário de Brasília; estimativa)"
    : "A confirmar pela transportadora";

  // The cargo is "container X (lacre Y)" for containers, or the short
  // goods description from the document (e.g. 02 CAMINHÕES USADOS) for
  // loose cargo, falling back to the freight identifier. Plates belong
  // to the crew, never to the cargo.
  const cargo = isContainerCode(c.code)
    ? `container ${c.code.trim().toUpperCase()}${c.seal ? ` (lacre ${c.seal})` : ""}`
    : c.cargoDescription?.trim().toUpperCase() ||
      c.code.trim().toUpperCase() ||
      "carga solta";
  const parameters = [
    cargo,
    msg.eventText,
    crewLine,
    `${c.client.name} com destino ${c.destination || "destino a confirmar"}`,
    etaText,
    link,
  ];
  const messageBody = formatUpdateMessage(parameters);

  const isPortGate = gate.kind === "PORT_EXIT" || gate.kind === "APPA";
  const nextStatus = isDestinationExit
    ? "ENTREGUE"
    : isPortDeparture
      ? "A_CAMINHO_DESTINO"
      : isPortGate
        ? "CHEGADA_PORTAO"
        : c.status;

  // DEDUPLICATION: Ensure exactly one notification per event kind per freight
  const alreadyNotified = await tx.notification.findFirst({
    where: {
      containerId: c.id,
      kind,
    },
    select: { id: true },
  });
  if (alreadyNotified) {
    return {
      status: nextStatus,
      gate,
      containerId: c.id,
      code: c.code,
      notificationId: null,
    };
  }

  const n = await tx.notification.create({
    data: {
      containerId: c.id,
      to: c.client.whatsapp,
      kind,
      parameters: JSON.stringify(parameters),
      body: messageBody,
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
    status: nextStatus,
    gate,
    containerId: c.id,
    code: c.code,
    notificationId: n.id,
  };
}

// Minimum time inside the gate before an exit can confirm. Kills
// drive-by pass-throughs on nearby roads; port queues take hours.
const ENTERED_DWELL_MS = 5 * 60 * 1000;

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
  // Replay re-evaluates already-stored positions (e.g. freights created
  // after the GPS fixes arrived): skips external-ID dedup and does not
  // insert duplicate position rows.
  replay?: boolean;
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
        include: { client: true, driver: true },
      });
      if (!c) throw new Error("Frete não vinculado ao motorista");
      if (
        !options.replay &&
        options.externalId &&
        (await tx.position.findFirst({
          where: { source, externalId: options.externalId },
          select: { id: true },
        }))
      )
        return null;
      if (c.status === "ENTREGUE") return null;
      if (c.lastGeofenceFixAt && fixAt <= c.lastGeofenceFixAt) return null;
      const gates = await tx.geofence.findMany({
        where: { active: true },
        orderBy: { createdAt: "asc" },
      });
      if (!gates.length) return null;
      const journeyEvents = await tx.geofenceEvent.findMany({
        where: { containerId: c.id },
        select: { geofenceId: true, type: true },
      });
      const journeyGates = journeyGatesFor(
        gates,
        c.code,
        c.destination,
        c.geofenceId,
      );
      if (!journeyGates.length) return null;

      const evaluationNow =
        source === "GLOBALSAT" ? fixAt.getTime() + 30000 : Date.now();

      // If the truck is currently inside a gate, continue evaluating that gate:
      let gate: (typeof gates)[number] | null = null;
      if (c.gateEnteredAt) {
        const lastEnter = await tx.geofenceEvent.findFirst({
          where: { containerId: c.id, type: "ENTER" },
          orderBy: { createdAt: "desc" },
        });
        gate =
          journeyGates.find((g) => g.id === lastEnter?.geofenceId) ||
          journeyTarget(
            gates,
            journeyEvents,
            c.code,
            c.destination,
            c.geofenceId,
          );
      }

      if (!gate) {
        const target = journeyTarget(
          gates,
          journeyEvents,
          c.code,
          c.destination,
          c.geofenceId,
        );
        if (target && reliableInside(input, target, evaluationNow)) {
          gate = target;
        } else if (target) {
          const targetIdx = journeyGates.findIndex((g) => g.id === target.id);
          const downstream =
            targetIdx >= 0 ? journeyGates.slice(targetIdx + 1) : [];
          const downstreamInside = downstream.find(
            (g) =>
              !gateCompleted(g, journeyEvents) &&
              reliableInside(input, g, evaluationNow),
          );
          gate = downstreamInside || target;
        }
      }

      if (!options.replay) {
        await tx.position.create({
          data: {
            ...input,
            recordedAt: fixAt,
            source,
            externalId: options.externalId,
          },
        });
      }
      // Journey complete: keep silent tracking, no Decisions.
      if (!gate) {
        await tx.container.update({
          where: { id: c.id },
          data: { lastGeofenceFixAt: fixAt },
        });
        return null;
      }
      const inside = reliableInside(input, gate, evaluationNow),
        outside = reliableOutside(input, gate, evaluationNow);
      const common = { lastGeofenceFixAt: fixAt };
      if (inside) {
        await tx.container.update({
          where: { id: c.id },
          data: {
            ...common,
            exitCandidateAt: null,
            gateEnteredAt: c.gateEnteredAt || fixAt,
            ...((gate.kind === "PORT_EXIT" || gate.kind === "APPA") &&
            c.status === "EM_TRANSITO"
              ? { status: "CHEGADA_PORTAO" }
              : {}),
          },
        });
        const alreadyEntered = journeyEvents.some(
          (e) => e.geofenceId === gate.id && e.type === "ENTER",
        );
        if (!c.gateEnteredAt && !alreadyEntered) {
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
          if (gate.notifyOnEnter)
            return notifyCheckpoint(tx, {
              gate,
              event: "ENTER",
              at: fixAt,
              input,
              container: c,
            });
          return {
            status:
              gate.kind === "PORT_EXIT" || gate.kind === "APPA"
                ? "CHEGADA_PORTAO"
                : c.status,
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
      const maxGapBetweenFixes =
        source === "GLOBALSAT" ? 4 * 3600 * 1000 : 120000;
      if (
        !c.exitCandidateAt ||
        !c.lastGeofenceFixAt ||
        fixAt.getTime() - c.lastGeofenceFixAt.getTime() > maxGapBetweenFixes
      ) {
        await tx.container.update({
          where: { id: c.id },
          data: { ...common, exitCandidateAt: fixAt },
        });
        return null;
      }
      const isConfirmedExit =
        elapsed >= 30000 ||
        (source === "GLOBALSAT" &&
          fixAt.getTime() - c.gateEnteredAt.getTime() >= 2 * 60 * 1000 &&
          distanceMeters(input, gate) - (input.accuracyM ?? 15) >=
            gate.radiusM + 150);
      if (!isConfirmedExit) {
        await tx.container.update({ where: { id: c.id }, data: common });
        return null;
      }
      // The truck must have actually operated inside the gate (queue,
      // loading, paperwork): drive-by pass-throughs never confirm.
      const isPort = gate.kind === "PORT_EXIT" || gate.kind === "APPA";
      const requiredDwellMs = isPort
        ? source === "GLOBALSAT"
          ? 2 * 60 * 1000
          : ENTERED_DWELL_MS
        : 30000;
      if (fixAt.getTime() - c.gateEnteredAt.getTime() < requiredDwellMs) {
        await tx.container.update({ where: { id: c.id }, data: common });
        return null;
      }
      // Cancel when the truck is heading back instead of leaving.
      const previous = await tx.position.findFirst({
        where: {
          containerId: c.id,
          recordedAt: { lt: c.exitCandidateAt },
        },
        orderBy: { recordedAt: "desc" },
      });
      if (
        previous &&
        c.exitCandidateAt.getTime() - previous.recordedAt.getTime() <=
          15 * 60 * 1000 &&
        returningToGate(input, previous, gate)
      ) {
        await tx.container.update({
          where: { id: c.id },
          data: { ...common, exitCandidateAt: null },
        });
        return null;
      }
      if (gate.notifyOnExit)
        return notifyCheckpoint(tx, {
          gate,
          event: "EXIT",
          at: c.exitCandidateAt,
          input,
          container: c,
        });
      // Idempotent for the same reason: retries must not violate the
      // unique (gate, freight, type) key.
      await tx.geofenceEvent.upsert({
        where: {
          geofenceId_containerId_type: {
            geofenceId: gate.id,
            containerId: c.id,
            type: "EXIT",
          },
        },
        update: {},
        create: {
          geofenceId: gate.id,
          containerId: c.id,
          type: "EXIT",
          latitude: input.latitude,
          longitude: input.longitude,
          createdAt: c.exitCandidateAt,
        },
      });
      const isDestinationExit = gate.kind === "DESTINATION";
      const nextStatus = isDestinationExit ? "ENTREGUE" : c.status;
      await tx.container.update({
        where: { id: c.id },
        data: {
          ...common,
          ...(isDestinationExit
            ? {
                status: "ENTREGUE",
                trackingTokenHash: null,
                trackingExpiresAt: null,
              }
            : {}),
          gateEnteredAt: null,
          exitCandidateAt: null,
        },
      });
      return {
        status: nextStatus,
        gate,
        containerId: c.id,
        code: c.code,
        notificationId: null,
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
