import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
const base = process.env.TEST_BASE_URL || "http://localhost:3002";
const db = new PrismaClient();
let createdId;
try {
  const login = await fetch(base + "/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }),
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(login.status, 200);
  const headers = { cookie: login.headers.get("set-cookie").split(";")[0] };
  const config = await (
    await fetch(base + "/api/documents", { headers })
  ).json();
  assert.equal(config.provider, "gemini");
  assert.equal(config.testOnly, true);
  const bytes = readFileSync("../FRETE-FICTICIO-TESTE.pdf");
  const form = (confirmed) => {
    const f = new FormData();
    f.set(
      "file",
      new Blob([bytes], { type: "application/pdf" }),
      "FRETE-FICTICIO-TESTE.pdf",
    );
    if (confirmed) f.set("testDocument", "on");
    return f;
  };
  const blocked = await fetch(base + "/api/documents", {
    method: "POST",
    headers,
    body: form(false),
  });
  assert.equal(blocked.status, 400);
  const response = await fetch(base + "/api/documents", {
    method: "POST",
    headers,
    body: form(true),
    signal: AbortSignal.timeout(60000),
  });
  const data = await response.json();
  if (response.status === 201) createdId = data.id;
  assert.equal(response.status, 201, data.error);
  assert.equal(data.extracted.fields.code, "TEST1234567");
  assert.equal(data.extracted.fields.crt, "TEST-CRT-002");
  assert.equal(data.extracted.fields.freightValue, "2200.00");
  assert.equal(data.extracted.fields.truckPlate, "TST1234");
  assert.equal(data.extracted.fields.trailerPlate, "TST5678");
  assert.equal(data.containerId, null);
  console.log(
    "PASS: production Gemini PDF extraction, free-tier declaration, draft awaiting review.",
  );
} finally {
  if (createdId)
    await db.tripDocument.deleteMany({
      where: { id: createdId, containerId: null },
    });
  await db.$disconnect();
}
