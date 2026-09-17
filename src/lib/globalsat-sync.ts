import { Prisma } from "@prisma/client";
import {
  GlobalSatClient,
  GlobalSatError,
  normalizePlate,
  parseGlobalSatDate,
  type GlobalSatTarget,
} from "./globalsat-client";
import { processPosition } from "./geofence-engine";
import { prisma } from "./prisma";

const PROVIDER = "GLOBALSAT";
const LOCK_MS = 120000;
const PAGE_LIMIT = 100;
const MAX_PAGES = 2;

export type ActiveTrip = {
  id: string;
  driverId: string;
  geofenceId: string;
  truckPlate: string | null;
  driver: { plate: string } | null;
};

export type GlobalSatSyncSummary = {
  status: "completed" | "already_running";
  activeTrips: number;
  matchedTrips: number;
  unmatchedPlates: string[];
  receivedPositions: number;
  processedPositions: number;
  duplicatePositions: number;
  previousCursor: string | null;
  nextCursor: string | null;
  startedAt: string;
  finishedAt: string;
};

export interface GlobalSatSyncRepository {
  acquire(
    now: Date,
    lockedUntil: Date,
  ): Promise<{ acquired: boolean; cursor: bigint | null }>;
  listActiveTrips(): Promise<ActiveTrip[]>;
  hasExternalPosition(externalId: string): Promise<boolean>;
  complete(
    cursor: bigint | null,
    summary: GlobalSatSyncSummary,
    now: Date,
  ): Promise<void>;
  fail(category: string, now: Date): Promise<void>;
  release(): Promise<void>;
}

export function matchActiveTrips(
  trips: ActiveTrip[],
  targets: GlobalSatTarget[],
) {
  const targetsByPlate = new Map(
    targets
      .map((target) => [normalizePlate(target.plate), target] as const)
      .filter(([plate]) => plate),
  );
  const matches: Array<{ trip: ActiveTrip; target: GlobalSatTarget }> = [];
  const unmatched = new Set<string>();
  for (const trip of trips) {
    const plate = normalizePlate(trip.truckPlate || trip.driver?.plate || "");
    if (!plate) continue;
    const target = targetsByPlate.get(plate);
    if (target) matches.push({ trip, target });
    else unmatched.add(plate);
  }
  return { matches, unmatchedPlates: [...unmatched].sort() };
}

const databaseRepository: GlobalSatSyncRepository = {
  async acquire(now, lockedUntil) {
    await prisma.integrationState.upsert({
      where: { provider: PROVIDER },
      create: { provider: PROVIDER },
      update: {},
    });
    const result = await prisma.integrationState.updateMany({
      where: {
        provider: PROVIDER,
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
      },
      data: { lockedUntil, lastStartedAt: now, lastError: null },
    });
    if (!result.count) return { acquired: false, cursor: null };
    const state = await prisma.integrationState.findUniqueOrThrow({
      where: { provider: PROVIDER },
      select: { cursor: true },
    });
    return { acquired: true, cursor: state.cursor };
  },
  async listActiveTrips() {
    const rows = await prisma.container.findMany({
      where: {
        status: { in: ["EM_TRANSITO", "CHEGADA_PORTAO"] },
        driverId: { not: null },
        geofenceId: { not: null },
      },
      select: {
        id: true,
        driverId: true,
        geofenceId: true,
        truckPlate: true,
        driver: { select: { plate: true } },
      },
    });
    return rows.filter(
      (row): row is ActiveTrip => !!row.driverId && !!row.geofenceId,
    );
  },
  async hasExternalPosition(externalId) {
    return (
      (await prisma.position.count({
        where: { source: PROVIDER, externalId },
      })) > 0
    );
  },
  async complete(cursor, summary, now) {
    await prisma.integrationState.update({
      where: { provider: PROVIDER },
      data: {
        cursor,
        lastSucceededAt: now,
        lastError: null,
        lastSummary: summary as unknown as Prisma.InputJsonValue,
      },
    });
  },
  async fail(category, now) {
    await prisma.integrationState.update({
      where: { provider: PROVIDER },
      data: { lastError: category, lastStartedAt: now },
    });
  },
  async release() {
    await prisma.integrationState.update({
      where: { provider: PROVIDER },
      data: { lockedUntil: null },
    });
  },
};

function configuredClient() {
  const clientId = process.env.GLOBALSAT_CLIENT_ID;
  const clientSecret = process.env.GLOBALSAT_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new GlobalSatError("AUTH");
  return new GlobalSatClient({ clientId, clientSecret });
}

function errorCategory(error: unknown) {
  return error instanceof GlobalSatError ? error.code : "UNEXPECTED";
}

type PendingFix = {
  externalId: string;
  recordedAt: Date;
  latitude: number;
  longitude: number;
};

export async function syncGlobalSat(
  deps: {
    client?: GlobalSatClient;
    repository?: GlobalSatSyncRepository;
    process?: typeof processPosition;
    now?: () => Date;
  } = {},
): Promise<GlobalSatSyncSummary> {
  const repository = deps.repository || databaseRepository;
  const now = deps.now || (() => new Date());
  const startedAt = now();
  const lock = await repository.acquire(
    startedAt,
    new Date(startedAt.getTime() + LOCK_MS),
  );
  const empty = (status: GlobalSatSyncSummary["status"]): GlobalSatSyncSummary => ({
    status,
    activeTrips: 0,
    matchedTrips: 0,
    unmatchedPlates: [],
    receivedPositions: 0,
    processedPositions: 0,
    duplicatePositions: 0,
    previousCursor: lock.cursor?.toString() || null,
    nextCursor: lock.cursor?.toString() || null,
    startedAt: startedAt.toISOString(),
    finishedAt: now().toISOString(),
  });
  if (!lock.acquired) return empty("already_running");

  let nextCursor = lock.cursor;
  try {
    const trips = await repository.listActiveTrips();
    const client = deps.client || configuredClient();
    const targets = trips.length ? await client.listTargets() : [];
    const { matches, unmatchedPlates } = matchActiveTrips(trips, targets);
    const fixesByTrip = new Map<string, Map<string, PendingFix>>();
    const targetById = new Map(targets.map((target) => [target.id, target]));
    const tripsByTarget = new Map<number, ActiveTrip[]>();
    for (const match of matches) {
      const list = tripsByTarget.get(match.target.id) || [];
      list.push(match.trip);
      tripsByTarget.set(match.target.id, list);
      if (match.target.position) {
        fixesByTrip.set(
          match.trip.id,
          new Map([
            [
              String(match.target.position.id),
              {
                externalId: String(match.target.position.id),
                recordedAt: match.target.position.recordedAt,
                latitude: match.target.position.latitude,
                longitude: match.target.position.longitude,
              },
            ],
          ]),
        );
      }
    }

    let receivedPositions = [...fixesByTrip.values()].reduce(
      (total, fixes) => total + fixes.size,
      0,
    );
    if (matches.length) {
      const targetIds = [...new Set(matches.map((match) => match.target.id))];
      for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber += 1) {
        const page = await client.getTrackingData({
          targetIds,
          ...(nextCursor === null
            ? { initialSince: new Date(startedAt.getTime() - 15 * 60 * 1000) }
            : { fromId: nextCursor }),
          limit: PAGE_LIMIT,
        });
        nextCursor = page.nextStartId;
        receivedPositions += page.positions.length;
        for (const position of page.positions) {
          const target = targetById.get(position.targetId);
          if (!target) continue;
          for (const trip of tripsByTarget.get(position.targetId) || []) {
            const fixes = fixesByTrip.get(trip.id) || new Map<string, PendingFix>();
            const externalId = position.id.toString();
            if (!fixes.has(externalId))
              fixes.set(externalId, {
                externalId,
                recordedAt: parseGlobalSatDate(position.gpsTime, target.gmtOffset),
                latitude: position.latitude,
                longitude: position.longitude,
              });
            fixesByTrip.set(trip.id, fixes);
          }
        }
        if (page.rows < PAGE_LIMIT) break;
      }
    }

    let processedPositions = 0;
    let duplicatePositions = 0;
    const processor = deps.process || processPosition;
    for (const { trip } of matches) {
      const fixes = [...(fixesByTrip.get(trip.id)?.values() || [])].sort(
        (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime(),
      );
      for (const fix of fixes) {
        if (await repository.hasExternalPosition(fix.externalId)) {
          duplicatePositions += 1;
          continue;
        }
        await processor(
          {
            driverId: trip.driverId,
            containerId: trip.id,
            latitude: fix.latitude,
            longitude: fix.longitude,
            accuracyM: 50,
            recordedAt: fix.recordedAt.toISOString(),
          },
          { source: "GLOBALSAT", externalId: fix.externalId },
        );
        processedPositions += 1;
      }
    }
    const finishedAt = now();
    const summary: GlobalSatSyncSummary = {
      status: "completed",
      activeTrips: trips.length,
      matchedTrips: matches.length,
      unmatchedPlates,
      receivedPositions,
      processedPositions,
      duplicatePositions,
      previousCursor: lock.cursor?.toString() || null,
      nextCursor: nextCursor?.toString() || null,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
    };
    await repository.complete(nextCursor, summary, finishedAt);
    return summary;
  } catch (error) {
    await repository.fail(errorCategory(error), now());
    throw error;
  } finally {
    await repository.release();
  }
}
