import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
assert.notEqual(process.env.WHATSAPP_PROVIDER, "meta", "Disable real WhatsApp before running smoke tests.");
const db = new PrismaClient();
const base = process.env.TEST_BASE_URL || "http://localhost:3000";
const created = {};
let cookie = "";
async function request(path, method = "GET", body, auth = true) {
  const r = await fetch(base + path, {
    method,
    headers: {
      ...(auth && cookie ? { Cookie: cookie } : {}),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  return r;
}
try {
  assert.equal(
    (await request("/api/clients", "GET", undefined, false)).status,
    401,
  );
  assert.equal((await request("/", "GET", undefined, false)).status, 307);
  assert.equal(
    (await request("/api/positions", "POST", { latitude: 0 }, false)).status,
    401,
  );
  assert.equal(
    (
      await request(
        "/api/integrations/globalsat/cron",
        "POST",
        undefined,
        false,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await request(
        "/api/integrations/globalsat/sync",
        "POST",
        undefined,
        false,
      )
    ).status,
    401,
  );
  const login = await request(
    "/api/auth",
    "POST",
    { password: process.env.ADMIN_PASSWORD },
    false,
  );
  assert.equal(login.status, 200);
  cookie = login.headers.get("set-cookie").split(";")[0];
  assert.match(login.headers.get("set-cookie"), /HttpOnly/i);
  async function create(path, body) {
    const r = await request(path, "POST", body);
    const p = await r.json();
    assert.equal(r.status, 201, JSON.stringify(p));
    return p;
  }
  const tag = "QA-" + Date.now();
  created.client = await create("/api/clients", {
    name: tag,
    whatsapp: "+15555550123",
    consent: true,
  });
  created.driver = await create("/api/drivers", {
    name: tag,
    phone: "+15555550124",
    plate: "TEST",
  });
  created.gate = await create("/api/geofences", {
    name: tag,
    latitude: 0,
    longitude: 0,
    radiusM: 300,
  });
  const code = "TEST" + String(Date.now()).slice(-7);
  created.container = await create("/api/containers", {
    code,
    clientId: created.client.id,
    driverId: created.driver.id,
    geofenceId: created.gate.id,
    origin: "QA",
    destination: "QA",
  });
  const linkResponse = await request(
    "/api/containers/" + created.container.id + "/tracking",
    "POST",
  );
  assert.equal(linkResponse.status, 200);
  const { url } = await linkResponse.json();
  const token = new URLSearchParams(new URL(url).hash.slice(1)).get("token");
  const detail = await fetch(base + "/api/tracking", {
    headers: { Authorization: "Bearer " + token },
  });
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).code, code);
  const fix = await fetch(base + "/api/positions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      latitude: 0,
      longitude: 0,
      accuracyM: 10,
      recordedAt: new Date().toISOString(),
    }),
  });
  assert.equal(fix.status, 200);
  assert.equal(
    (await fix.json()).triggers[0].notificationStatus,
    "UNCONFIGURED",
  );
  const dashboard = await request("/");
  assert.equal(dashboard.status, 200);
  assert.ok((await dashboard.text()).includes(code));
  const finish = await request(
    "/api/containers/" + created.container.id + "/status",
    "PATCH",
    { status: "ENTREGUE" },
  );
  assert.equal(finish.status, 200);
  assert.equal(
    (
      await fetch(base + "/api/tracking", {
        headers: { Authorization: "Bearer " + token },
      })
    ).status,
    401,
  );
  console.log(
    "PASS: anonymous access blocked; GlobalSAT routes protected; login; all registrations; private tracking; GPS arrival; dashboard rendering; completion revokes token.",
  );
} finally {
  if (created.container) {
    const containerId = created.container.id;
    await db.notification.deleteMany({ where: { containerId } });
    await db.geofenceEvent.deleteMany({ where: { containerId } });
    await db.position.deleteMany({ where: { containerId } });
    await db.container.delete({ where: { id: containerId } });
  }
  if (created.gate)
    await db.geofence.delete({ where: { id: created.gate.id } });
  if (created.driver)
    await db.driver.delete({ where: { id: created.driver.id } });
  if (created.client)
    await db.client.delete({ where: { id: created.client.id } });
  await db.$disconnect();
}
