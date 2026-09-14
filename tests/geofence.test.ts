import test from "node:test";
import assert from "node:assert/strict";
import { distanceMeters } from "../src/lib/geo.ts";
import { reliableInside, reliableOutside } from "../src/lib/geofence-policy.ts";
import { createSession, validSession } from "../src/lib/session.ts";
const gate = { latitude: -23.94, longitude: -46.31, radiusM: 300 };
const now = Date.now();
const fix = { ...gate, accuracyM: 15, recordedAt: new Date(now).toISOString() };
test("haversine distance is symmetric and zero at the gate", () => {
  assert.equal(distanceMeters(gate, gate), 0);
  const b = { latitude: 0, longitude: 1 };
  assert.ok(
    Math.abs(distanceMeters({ latitude: 0, longitude: 0 }, b) - 111195) < 2,
  );
  assert.equal(distanceMeters(gate, b), distanceMeters(b, gate));
});
test("fresh accurate fix triggers within assigned gate", () =>
  assert.equal(reliableInside(fix, gate, now), true));
test("uncertainty overlapping boundary does not trigger", () =>
  assert.equal(
    reliableInside(
      { ...fix, latitude: gate.latitude + 0.0026, accuracyM: 30 },
      gate,
      now,
    ),
    false,
  ));
test("poor accuracy and stale or future timestamps are rejected", () => {
  assert.equal(reliableInside({ ...fix, accuracyM: 101 }, gate, now), false);
  assert.equal(
    reliableInside(
      { ...fix, recordedAt: new Date(now - 121000).toISOString() },
      gate,
      now,
    ),
    false,
  );
  assert.equal(
    reliableInside(
      { ...fix, recordedAt: new Date(now + 60000).toISOString() },
      gate,
      now,
    ),
    false,
  );
  assert.equal(
    reliableInside({ ...fix, recordedAt: "invalid" }, gate, now),
    false,
  );
});
test("outside fixes do not trigger", () =>
  assert.equal(
    reliableInside({ ...fix, latitude: gate.latitude + 0.02 }, gate, now),
    false,
  ));
test("session signatures are verified and tampering rejected", async () => {
  process.env.SESSION_SECRET = "test-only-secret-".repeat(4);
  const token = await createSession();
  assert.equal(await validSession(token), true);
  assert.equal(await validSession(token + "broken"), false);
  assert.equal(await validSession(), false);
});
test("exit needs GPS accuracy beyond the gate plus a 50m buffer", () => {
  assert.equal(
    reliableOutside({ ...fix, latitude: gate.latitude + 0.0028 }, gate, now),
    false,
  );
  assert.equal(
    reliableOutside({ ...fix, latitude: gate.latitude + 0.004 }, gate, now),
    true,
  );
  assert.equal(
    reliableOutside(
      { ...fix, latitude: gate.latitude + 0.004, accuracyM: 900 },
      gate,
      now,
    ),
    false,
  );
  assert.equal(
    reliableOutside(
      {
        ...fix,
        latitude: gate.latitude + 0.004,
        recordedAt: new Date(now - 121000).toISOString(),
      },
      gate,
      now,
    ),
    false,
  );
});
