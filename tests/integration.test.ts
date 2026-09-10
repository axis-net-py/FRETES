import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { processPosition } from "../src/lib/geofence-engine";
import { trackingContainer, hashToken } from "../src/lib/tracking";
test("database: one event per arrival, no real send, token isolation and expiry", async () => {
  if (process.env.WHATSAPP_PROVIDER === "meta")
    throw new Error("Run integration tests with WHATSAPP_PROVIDER=disabled.");
  const suffix = randomUUID();
  let clientId = "",
    driverId = "",
    gateId = "",
    containerId = "";
  try {
    const client = await prisma.client.create({
      data: { name: "TEST-" + suffix, whatsapp: "+15555550123", consent: true },
    });
    clientId = client.id;
    const driver = await prisma.driver.create({
      data: { name: "TEST-" + suffix, phone: "+15555550124" },
    });
    driverId = driver.id;
    const gate = await prisma.geofence.create({
      data: {
        name: "TEST-" + suffix,
        latitude: 0,
        longitude: 0,
        radiusM: 300,
        status: "CHEGADA_PORTAO",
      },
    });
    gateId = gate.id;
    const token = randomBytes(32).toString("hex");
    const container = await prisma.container.create({
      data: {
        code: "TEST-" + suffix,
        clientId,
        driverId,
        geofenceId: gateId,
        trackingTokenHash: hashToken(token),
        trackingExpiresAt: new Date(Date.now() + 60000),
      },
    });
    containerId = container.id;
    const req = new Request("https://example.test/api/tracking", {
      headers: { Authorization: "Bearer " + token },
    });
    assert.equal((await trackingContainer(req))?.id, containerId);
    assert.equal(
      await trackingContainer(new Request("https://example.test")),
      null,
    );
    const base = {
      containerId,
      driverId,
      latitude: 0,
      longitude: 0,
      accuracyM: 10,
      recordedAt: new Date().toISOString(),
    };
    await processPosition({ ...base, accuracyM: 900 });
    assert.equal(
      await prisma.geofenceEvent.count({ where: { containerId } }),
      0,
    );
    await assert.rejects(() =>
      processPosition({ ...base, driverId: "unrelated" }),
    );
    await Promise.all([
      processPosition(base),
      processPosition(base),
      processPosition(base),
    ]);
    assert.equal(
      await prisma.geofenceEvent.count({ where: { containerId } }),
      1,
    );
    assert.equal(
      await prisma.notification.count({ where: { containerId } }),
      1,
    );
    assert.equal(
      (await prisma.notification.findFirst({ where: { containerId } }))?.status,
      "UNCONFIGURED",
    );
    assert.equal(
      (await prisma.container.findUnique({ where: { id: containerId } }))
        ?.status,
      "CHEGADA_PORTAO",
    );
    await processPosition(base);
    assert.equal(
      await prisma.notification.count({ where: { containerId } }),
      1,
    );
    await prisma.container.update({
      where: { id: containerId },
      data: { trackingExpiresAt: new Date(0) },
    });
    assert.equal(await trackingContainer(req), null);
  } finally {
    if (containerId) {
      await prisma.notification.deleteMany({ where: { containerId } });
      await prisma.geofenceEvent.deleteMany({ where: { containerId } });
      await prisma.position.deleteMany({ where: { containerId } });
      await prisma.container.delete({ where: { id: containerId } });
    }
    if (gateId) await prisma.geofence.delete({ where: { id: gateId } });
    if (driverId) await prisma.driver.delete({ where: { id: driverId } });
    if (clientId) await prisma.client.delete({ where: { id: clientId } });
    await prisma.$disconnect();
  }
});
