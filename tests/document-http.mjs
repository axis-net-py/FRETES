import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const base = process.env.TEST_BASE_URL || "http://localhost:3002";
const suffix = String(Date.now());
let docId, containerId, gate, driverId, clientId;
try {
  assert.equal((await fetch(base + "/api/documents")).status, 401);
  const login = await fetch(base + "/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const headers = { cookie };
  const info = await (await fetch(base + "/api/documents", { headers })).json();
  assert.equal(typeof info.ready, "boolean");
  const bytes = Buffer.from("%PDF-1.4\n% smoke-test " + suffix + "\n%%EOF");
  const form = () => {
    const f = new FormData();
    f.set("mode", "manual");
    f.set(
      "file",
      new Blob([bytes], { type: "application/pdf" }),
      "test-" + suffix + ".pdf",
    );
    return f;
  };
  const upload = await fetch(base + "/api/documents", {
    method: "POST",
    headers,
    body: form(),
  });
  assert.equal(upload.status, 201);
  const doc = await upload.json();
  docId = doc.id;
  const duplicate = await (
    await fetch(base + "/api/documents", {
      method: "POST",
      headers,
      body: form(),
    })
  ).json();
  assert.equal(duplicate.id, docId);
  assert.equal((await fetch(base + "/api/documents/" + docId)).status, 401);
  const download = await fetch(base + "/api/documents/" + docId, { headers });
  assert.equal(download.headers.get("content-type"), "application/pdf");
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
  gate = await db.geofence.create({
    data: {
      name: "TEST IMPORT " + suffix,
      latitude: 0,
      longitude: 0,
      radiusM: 300,
      status: "CHEGADA_PORTAO",
    },
  });
  const body = {
    fields: {
      clientName: "TEST IMPORT " + suffix,
      code: "TEST" + suffix.slice(-7),
      crt: "CRT-TEST",
      micDta: "MIC-TEST",
      driverName: "TEST DRIVER " + suffix,
      truckPlate: "TEST123",
      trailerPlate: "TEST456",
      freightValue: "2200.00",
      freightCurrency: "USD",
      origin: "Teste",
      destination: "Teste",
      seal: "TEST",
    },
    clientId: "",
    driverId: "",
    geofenceId: gate.id,
    whatsapp: "",
    consent: false,
    confirmed: true,
  };
  const save = () =>
    fetch(base + "/api/documents/" + docId, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const saved = await save();
  assert.equal(saved.status, 201);
  containerId = (await saved.json()).id;
  const freight = await db.container.findUniqueOrThrow({
    where: { id: containerId },
    include: { client: true, driver: true },
  });
  driverId = freight.driverId;
  clientId = freight.clientId;
  assert.equal(freight.crt, "CRT-TEST");
  assert.equal(freight.freightValue, "2200.00");
  assert.equal(freight.client.consent, false);
  assert.equal((await (await save()).json()).id, containerId);
  assert.equal(await db.notification.count({ where: { containerId } }), 0);
  console.log(
    "PASS: authenticated upload, deduplication, private download, reviewed creation, idempotent confirmation, no unsolicited notification",
  );
} finally {
  if (docId) await db.tripDocument.deleteMany({ where: { id: docId } });
  if (containerId)
    await db.container.deleteMany({ where: { id: containerId } });
  if (driverId) await db.driver.deleteMany({ where: { id: driverId } });
  if (clientId) await db.client.deleteMany({ where: { id: clientId } });
  if (gate) await db.geofence.deleteMany({ where: { id: gate.id } });
  await db.$disconnect();
}
