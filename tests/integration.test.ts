import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { processPosition } from "../src/lib/geofence-engine";
import { trackingContainer, hashToken } from "../src/lib/tracking";
import { GET as customerTracking } from "../src/app/api/customer-tracking/route";
import { syncGlobalSat } from "../src/lib/globalsat-sync";
import type { GlobalSatClient } from "../src/lib/globalsat-client";
test("entry waits without WhatsApp; ordered sustained exit sends once, with ETA and isolated customer access", async () => {
  if (process.env.WHATSAPP_PROVIDER === "meta")
    throw new Error("Tests require disabled WhatsApp");
  const suffix = randomUUID();
  let clientId = "",
    driverId = "",
    gateId = "",
    containerId = "";
  try {
    await prisma.integrationState.deleteMany({
      where: { provider: "GLOBALSAT" },
    });
    clientId = (
      await prisma.client.create({
        data: {
          name: "TEST-" + suffix,
          whatsapp: "+15555550123",
          consent: true,
        },
      })
    ).id;
    driverId = (
      await prisma.driver.create({
        data: {
          name: "TEST-" + suffix,
          phone: "+15555550124",
          plate: "TST" + suffix.replaceAll("-", "").slice(0, 4),
        },
      })
    ).id;
    gateId = (
      await prisma.geofence.create({
        data: {
          name: "TEST-" + suffix,
          latitude: 0,
          longitude: 0,
          radiusM: 300,
          status: "CHEGADA_PORTAO",
        },
      })
    ).id;
    const token = randomBytes(32).toString("hex");
    containerId = (
      await prisma.container.create({
        data: {
          code: "TEST-" + suffix,
          clientId,
          driverId,
          geofenceId: gateId,
          transitHours: 48,
          destination: "Destino fictício",
          trackingTokenHash: hashToken(token),
          trackingExpiresAt: new Date(Date.now() + 60000),
        },
      })
    ).id;
    const request = (t: string) =>
      new Request("https://example.test", {
        headers: { Authorization: "Bearer " + t },
      });
    assert.equal((await trackingContainer(request(token)))?.id, containerId);
    const now = Date.now();
    const fix = (seconds: number, latitude = 0, accuracyM = 10) => ({
      containerId,
      driverId,
      latitude,
      longitude: 0,
      accuracyM,
      recordedAt: new Date(now + seconds * 1000).toISOString(),
    });
    const providerPositionId = Math.floor(now / 1000);
    const driver = await prisma.driver.findUniqueOrThrow({
      where: { id: driverId },
    });
    const globalSat = {
      listTargets: async () => [
        {
          id: 991001,
          plate: driver.plate,
          gmtOffset: -3,
          position: {
            id: providerPositionId,
            latitude: 0.01,
            longitude: 0,
            recordedAt: new Date(now - 116000),
          },
        },
      ],
      getTrackingData: async () => ({
        nextStartId: BigInt(providerPositionId),
        rows: 0,
        positions: [],
      }),
    } as unknown as GlobalSatClient;
    const firstSync = await syncGlobalSat({ client: globalSat });
    const secondSync = await syncGlobalSat({ client: globalSat });
    assert.equal(firstSync.processedPositions, 1);
    assert.equal(secondSync.duplicatePositions, 1);
    assert.equal(
      await prisma.position.count({
        where: {
          source: "GLOBALSAT",
          externalId: String(providerPositionId),
        },
      }),
      1,
    );
    await processPosition(fix(-110, 0, 900));
    await assert.rejects(
      processPosition({ ...fix(-109), driverId: "unrelated" }),
    );
    await processPosition(fix(-105, 0.01));
    await processPosition(fix(-101, 0.01));
    assert.equal(
      await prisma.notification.count({ where: { containerId } }),
      0,
    );
    await Promise.all([
      processPosition(fix(-95)),
      processPosition(fix(-95)),
      processPosition(fix(-95)),
    ]);
    assert.equal(
      await prisma.geofenceEvent.count({
        where: { containerId, type: "ENTER" },
      }),
      1,
    );
    assert.equal(
      await prisma.notification.count({ where: { containerId } }),
      0,
    );
    assert.equal(
      (await prisma.container.findUnique({ where: { id: containerId } }))
        ?.status,
      "CHEGADA_PORTAO",
    );
    await processPosition(fix(-80, 0.01));
    await processPosition(fix(-75, 0.0028)); // Boundary uncertainty clears the exit candidate.
    await processPosition(fix(-60, 0.01));
    await processPosition(fix(-90)); // Out-of-order fix cannot undo newer evidence.
    await processPosition(fix(-50, 0.01));
    assert.equal(
      await prisma.notification.count({ where: { containerId } }),
      0,
    );
    await Promise.all([
      processPosition(fix(-30, 0.01)),
      processPosition(fix(-30, 0.01)),
      processPosition(fix(-30, 0.01)),
    ]);
    const c = await prisma.container.findUniqueOrThrow({
      where: { id: containerId },
    });
    assert.equal(c.status, "A_CAMINHO_DESTINO");
    assert.equal(c.estimatedArrivalAt?.getTime(), now - 60000 + 48 * 3600000);
    assert.equal(
      await prisma.geofenceEvent.count({
        where: { containerId, type: "EXIT" },
      }),
      1,
    );
    assert.equal(
      await prisma.notification.count({ where: { containerId } }),
      1,
    );
    const n = await prisma.notification.findFirstOrThrow({
      where: { containerId },
    });
    assert.equal(n.status, "UNCONFIGURED");
    assert.equal(n.kind, "DEPARTURE");
    const parameters = JSON.parse(n.parameters);
    assert.equal(parameters.length, 6);
    const customerToken = parameters[5].split("#")[1];
    assert.equal((await customerTracking(request(token))).status, 404);
    assert.equal(await trackingContainer(request(customerToken)), null);
    const publicResponse = await customerTracking(request(customerToken));
    assert.equal(publicResponse.status, 200);
    const visible = await publicResponse.json();
    assert.equal(visible.code, c.code);
    assert.equal(
      visible.estimatedArrivalAt,
      c.estimatedArrivalAt?.toISOString(),
    );
    for (const field of [
      "client",
      "driver",
      "freightValue",
      "customerTrackingHash",
      "latitude",
    ])
      assert.equal(field in visible, false);
    await processPosition(fix(-10, 0.01));
    assert.equal(
      await prisma.notification.count({ where: { containerId } }),
      1,
    );
    await prisma.container.update({
      where: { id: containerId },
      data: {
        customerTrackingExpiresAt: new Date(0),
        trackingExpiresAt: new Date(0),
      },
    });
    assert.equal((await customerTracking(request(customerToken))).status, 404);
    assert.equal(await trackingContainer(request(token)), null);
  } finally {
    if (containerId) {
      await prisma.notification.deleteMany({ where: { containerId } });
      await prisma.geofenceEvent.deleteMany({ where: { containerId } });
      await prisma.position.deleteMany({ where: { containerId } });
      await prisma.container.deleteMany({ where: { id: containerId } });
    }
    if (gateId) await prisma.geofence.deleteMany({ where: { id: gateId } });
    if (driverId) await prisma.driver.deleteMany({ where: { id: driverId } });
    if (clientId) await prisma.client.deleteMany({ where: { id: clientId } });
    await prisma.integrationState.deleteMany({
      where: { provider: "GLOBALSAT" },
    });
    await prisma.$disconnect();
  }
});
