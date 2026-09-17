import test from "node:test";
import assert from "node:assert/strict";
import type { GlobalSatClient, GlobalSatTarget } from "../src/lib/globalsat-client.ts";
import {
  matchActiveTrips,
  syncGlobalSat,
  type ActiveTrip,
  type GlobalSatSyncRepository,
} from "../src/lib/globalsat-sync.ts";
import { dashboardGlobalSatState } from "../src/lib/globalsat-status.ts";

const trip = (plate: string | null, driverPlate = ""): ActiveTrip => ({
  id: `trip-${plate || driverPlate}`,
  driverId: "driver-1",
  geofenceId: "gate-1",
  truckPlate: plate,
  driver: { plate: driverPlate },
});

const target = (id: number, plate: string): GlobalSatTarget => ({
  id,
  plate,
  gmtOffset: -3,
  position: {
    id: 30,
    latitude: -25.5,
    longitude: -54.6,
    recordedAt: new Date("2026-09-17T13:30:00Z"),
  },
});

test("matches active trips by exact normalized truck plate before driver plate", () => {
  const trips = [
    trip(" AAM-E814 ", "WRONG1"),
    trip(null, "ABC-1234"),
    trip("NEAR123", ""),
  ];
  const result = matchActiveTrips(trips, [
    target(1, "AAME814"),
    target(2, "ABC1234"),
    target(3, "NEAR124"),
  ]);
  assert.deepEqual(
    result.matches.map(({ trip: matched, target: vehicle }) => [matched.id, vehicle.id]),
    [
      ["trip- AAM-E814 ", 1],
      ["trip-ABC-1234", 2],
    ],
  );
  assert.deepEqual(result.unmatchedPlates, ["NEAR123"]);
});

test("does no external work when another synchronization owns the lock", async () => {
  let listed = false;
  const repository: GlobalSatSyncRepository = {
    acquire: async () => ({ acquired: false, cursor: null }),
    listActiveTrips: async () => {
      listed = true;
      return [];
    },
    hasExternalPosition: async () => false,
    complete: async () => undefined,
    fail: async () => undefined,
    release: async () => undefined,
  };
  const result = await syncGlobalSat({ repository });
  assert.equal(result.status, "already_running");
  assert.equal(listed, false);
});

test("orders history with current position and advances cursor only after success", async () => {
  let completedCursor: bigint | null | undefined;
  let released = false;
  const repository: GlobalSatSyncRepository = {
    acquire: async () => ({ acquired: true, cursor: null }),
    listActiveTrips: async () => [trip("AAM-E814")],
    hasExternalPosition: async () => false,
    complete: async (cursor) => {
      completedCursor = cursor;
    },
    fail: async () => assert.fail("must not fail"),
    release: async () => {
      released = true;
    },
  };
  const fakeTarget = target(1, "AAM-E814");
  const client = {
    listTargets: async () => [fakeTarget],
    getTrackingData: async () => ({
      nextStartId: BigInt(30),
      rows: 2,
      positions: [
        {
          id: BigInt(20),
          targetId: 1,
          latitude: -25.4,
          longitude: -54.5,
          gpsTime: "17/09/2026 10:20:00",
        },
        {
          id: BigInt(10),
          targetId: 1,
          latitude: -25.3,
          longitude: -54.4,
          gpsTime: "17/09/2026 10:10:00",
        },
      ],
    }),
  } as unknown as GlobalSatClient;
  const processed: string[] = [];
  const result = await syncGlobalSat({
    repository,
    client,
    now: () => new Date("2026-09-17T13:35:00Z"),
    process: async (input, options) => {
      processed.push(
        `${options?.externalId}:${input.recordedAt}:${input.accuracyM}`,
      );
      return [];
    },
  });
  assert.deepEqual(processed, [
    "10:2026-09-17T13:10:00.000Z:50",
    "20:2026-09-17T13:20:00.000Z:50",
    "30:2026-09-17T13:30:00.000Z:50",
  ]);
  assert.equal(completedCursor, BigInt(30));
  assert.equal(released, true);
  assert.equal(result.processedPositions, 3);
});

test("preserves cursor and records a sanitized category after failure", async () => {
  let completed = false;
  let failure = "";
  const repository: GlobalSatSyncRepository = {
    acquire: async () => ({ acquired: true, cursor: BigInt(9) }),
    listActiveTrips: async () => [trip("AAM-E814")],
    hasExternalPosition: async () => false,
    complete: async () => {
      completed = true;
    },
    fail: async (category) => {
      failure = category;
    },
    release: async () => undefined,
  };
  const client = {
    listTargets: async () => [target(1, "AAM-E814")],
    getTrackingData: async () => {
      throw new Error("private upstream response");
    },
  } as unknown as GlobalSatClient;
  await assert.rejects(syncGlobalSat({ repository, client }));
  assert.equal(completed, false);
  assert.equal(failure, "UNEXPECTED");
  assert.doesNotMatch(failure, /private/);
});

test("exposes only a sanitized GlobalSAT dashboard status", () => {
  assert.deepEqual(
    dashboardGlobalSatState(
      {
        lastSucceededAt: new Date("2026-09-17T13:00:00Z"),
        lastError: "private upstream response",
      },
      true,
    ),
    {
      configured: true,
      status: "error",
      lastSyncAt: "2026-09-17T13:00:00.000Z",
    },
  );
  assert.deepEqual(dashboardGlobalSatState(null, false), {
    configured: false,
    status: "pending",
    lastSyncAt: null,
  });
});
