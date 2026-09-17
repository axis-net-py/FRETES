import test from "node:test";
import assert from "node:assert/strict";
import { GlobalSatError } from "../src/lib/globalsat-client.ts";
import { validSyncSecret } from "../src/lib/sync-secret.ts";
import { handleGlobalSatSync } from "../src/lib/globalsat-route.ts";

const secret = "test-sync-secret-with-at-least-32-characters";

test("validates the scheduled caller secret without length leakage", () => {
  process.env.GLOBALSAT_SYNC_SECRET = secret;
  assert.equal(validSyncSecret(`Bearer ${secret}`), true);
  assert.equal(validSyncSecret(null), false);
  assert.equal(validSyncSecret("Bearer short"), false);
  assert.equal(validSyncSecret(`Bearer ${secret}x`), false);
});

test("rejects an unauthorized cron request before synchronization", async () => {
  let called = false;
  process.env.GLOBALSAT_SYNC_SECRET = secret;
  const response = await handleGlobalSatSync(
    new Request("https://example.test/api/integrations/globalsat/cron", {
      method: "POST",
    }),
    { requireSecret: true, sync: async () => ((called = true), summary()) },
  );
  assert.equal(response.status, 401);
  assert.equal(called, false);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("returns completed and already-running summaries", async () => {
  process.env.GLOBALSAT_SYNC_SECRET = secret;
  const complete = await handleGlobalSatSync(
    new Request("https://example.test/api/integrations/globalsat/cron", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
    }),
    { requireSecret: true, sync: async () => summary() },
  );
  assert.equal(complete.status, 200);
  const running = await handleGlobalSatSync(
    new Request("https://example.test/api/integrations/globalsat/sync", {
      method: "POST",
    }),
    {
      requireSecret: false,
      sync: async () => ({ ...summary(), status: "already_running" }),
    },
  );
  assert.equal(running.status, 202);
});

test("sanitizes upstream and unexpected failures", async () => {
  const limited = await handleGlobalSatSync(
    new Request("https://example.test"),
    {
      requireSecret: false,
      sync: async () => {
        throw new GlobalSatError("RATE_LIMITED");
      },
    },
  );
  assert.equal(limited.status, 503);
  assert.deepEqual(await limited.json(), {
    error: "GlobalSAT temporariamente indisponível.",
  });
  const unexpected = await handleGlobalSatSync(
    new Request("https://example.test"),
    {
      requireSecret: false,
      sync: async () => {
        throw new Error("private response body");
      },
    },
  );
  assert.equal(unexpected.status, 500);
  assert.doesNotMatch(JSON.stringify(await unexpected.json()), /private/);
});

function summary() {
  const time = "2026-09-17T13:00:00.000Z";
  return {
    status: "completed" as const,
    activeTrips: 1,
    matchedTrips: 1,
    unmatchedPlates: [],
    receivedPositions: 1,
    processedPositions: 1,
    duplicatePositions: 0,
    previousCursor: null,
    nextCursor: "1",
    startedAt: time,
    finishedAt: time,
  };
}
