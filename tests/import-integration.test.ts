import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { createSession, COOKIE } from "../src/lib/session";
import { POST as register } from "../src/app/api/documents/[id]/route";
import { PATCH, DELETE } from "../src/app/api/containers/[id]/route";
import { emptyFields } from "../src/lib/document-fields";

test("import reuses normalized records, resolves vehicles, fixes gate, stores planning and protects mutations", async () => {
  assert.match(
    new URL(process.env.DATABASE_URL!).searchParams.get("schema") || "",
    /^fretes_qa_/,
    "Integration tests require a dedicated fretes_qa_ schema",
  );
  const session = await createSession();
  const request = (body: unknown, authenticated = true, method = "POST") =>
    new Request("http://localhost/api/documents/review", {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(authenticated ? { Cookie: `${COOKIE}=${session}` } : {}),
      },
      body: JSON.stringify(body),
    });
  const fields = {
    ...emptyFields,
    clientName: "Teste São José",
    driverName: "Claudionor Gonzalez",
    truckPlate: "QA-A1234",
    trailerPlate: "QA-B5678",
    code: "QAAA1234567",
    destination: "Ciudad del Este, Paraguay",
  };
  let firstId = "",
    secondId = "",
    gateId = "",
    driverId = "",
    clientId = "";
  const docs: string[] = [];
  try {
    gateId = (
      await prisma.geofence.create({
        data: {
          name: "Porto de Paranaguá QA",
          latitude: -25.51,
          longitude: -48.52,
          radiusM: 300,
          status: "CHEGADA_PORTAO",
        },
      })
    ).id;
    async function document(tag: string) {
      const content = Buffer.from("%PDF-1.7 " + tag);
      const d = await prisma.tripDocument.create({
        data: {
          filename: tag + ".pdf",
          mimeType: "application/pdf",
          content,
          sha256: createHash("sha256").update(content).digest("hex"),
          extracted: {
            promptVersion: 5,
            trips: [{ fields, warning: "" }],
            warning: "",
          },
        },
      });
      docs.push(d.id);
      return { params: Promise.resolve({ id: d.id }) };
    }
    const params = await document("import-qa-first");
    const body = {
      fields,
      clientId: "",
      driverId: "",
      geofenceId: "untrusted-gate",
      whatsapp: "",
      consent: false,
      confirmed: true,
      transitHours: 1,
      routeDurationSeconds: 36000,
      operationalMarginSeconds: 14400,
    };
    assert.equal((await register(request(body, false), params)).status, 401);
    const results = await Promise.all([
      register(request(body), params),
      register(request(body), params),
    ]);
    assert.equal(results[0].status, 201);
    assert.equal(results[1].status, 201);
    firstId = (await results[0].json()).id;
    assert.equal((await results[1].json()).id, firstId);
    const first = await prisma.container.findUniqueOrThrow({
      where: { id: firstId },
    });
    driverId = first.driverId!;
    clientId = first.clientId;
    assert.equal(first.geofenceId, gateId);
    assert.equal(first.transitHours, 14);
    assert.equal(first.routeDurationSeconds, 36000);
    assert.equal(first.operationalMarginSeconds, 14400);
    const second = await register(
      request({
        ...body,
        fields: {
          ...fields,
          code: "QAAA1234568",
          clientName: " TESTE SAO JOSE ",
          driverName: "Gonzalez, Claudionor",
          truckPlate: "QAA1234",
          trailerPlate: "QAB5678",
        },
      }),
      await document("import-qa-second"),
    );
    assert.equal(second.status, 201);
    secondId = (await second.json()).id;
    const reused = await prisma.container.findUniqueOrThrow({
      where: { id: secondId },
    });
    assert.equal(reused.clientId, clientId);
    assert.equal(reused.driverId, driverId);
    assert.equal(reused.truckVehicleId, first.truckVehicleId);
    assert.equal(reused.trailerVehicleId, first.trailerVehicleId);
    const mutation = { params: Promise.resolve({ id: firstId }) };
    const edit = {
      ...fields,
      clientId,
      driverId,
      geofenceId: gateId,
      transitHours: 18,
    };
    assert.equal(
      (await PATCH(request(edit, false, "PATCH"), mutation)).status,
      401,
    );
    assert.equal(
      (await DELETE(request({}, false, "DELETE"), mutation)).status,
      401,
    );
    const editedResponse = await PATCH(request(edit, true, "PATCH"), mutation);
    assert.equal(editedResponse.status, 200);
    const editedBody = await editedResponse.json();
    assert.equal(editedBody.client.id, clientId);
    assert.equal(editedBody.driver.id, driverId);
    assert.equal(editedBody.documentLinks[0].document.id, docs[0]);
    assert.equal("content" in editedBody.documentLinks[0].document, false);
    assert.equal("trackingTokenHash" in editedBody, false);
    assert.equal("customerTrackingHash" in editedBody, false);
    const changed = await prisma.container.findUniqueOrThrow({
      where: { id: firstId },
    });
    assert.equal(changed.transitHours, 18);
    assert.equal(changed.routeDurationSeconds, null);
    assert.equal(
      (await DELETE(request({}, true, "DELETE"), mutation)).status,
      200,
    );
    assert.equal(
      await prisma.container.findUnique({ where: { id: firstId } }),
      null,
    );
    assert.equal(
      await prisma.documentLink.count({
        where: { documentId: docs[0] },
      }),
      0,
    );
    assert.ok(
      await prisma.tripDocument.findUnique({ where: { id: docs[0] } }),
    );
  } finally {
    await prisma.tripDocument.deleteMany({ where: { id: { in: docs } } });
    await prisma.container.deleteMany({
      where: { id: { in: [firstId, secondId] } },
    });
    if (driverId) await prisma.driver.delete({ where: { id: driverId } });
    if (clientId) await prisma.client.delete({ where: { id: clientId } });
    if (gateId) await prisma.geofence.delete({ where: { id: gateId } });
    await prisma.vehicle.deleteMany({
      where: { plate: { in: ["QAA1234", "QAB5678"] } },
    });
    await prisma.$disconnect();
  }
});
