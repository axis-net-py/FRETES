import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "../src/app/api/drivers/route";
import { prisma } from "../src/lib/prisma";
import { createSession, COOKIE } from "../src/lib/session";

test("driver registration accepts missing phones, validates supplied phones and requires login", async (t) => {
  process.env.SESSION_SECRET = "fixture-driver-registration-secret-32-characters";
  const cookie = `${COOKIE}=${await createSession()}`;
  const original = prisma.driver.create;
  const create = t.mock.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "fixture-driver", ...data }));
  prisma.driver.create = create as unknown as typeof original;
  t.after(() => { prisma.driver.create = original; });
  const request = (body: unknown, authenticated = true) => new Request("https://fretes.example/api/drivers", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(authenticated ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
  for (const phone of [undefined, "", "+595981123456"]) {
    const response = await POST(request({ name: "Fixture Driver", plate: "ABC1234", phone }));
    assert.equal(response.status, 201);
    assert.equal((await response.json()).phone, phone ?? "");
  }
  assert.equal((await POST(request({ name: "Fixture Driver", phone: "invalid" }))).status, 400);
  assert.equal((await POST(request({ name: "Fixture Driver", phone: "+595981123456" }, false))).status, 401);
  assert.equal(create.mock.callCount(), 3);
});
