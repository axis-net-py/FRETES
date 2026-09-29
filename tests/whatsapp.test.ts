import test from "node:test";
import assert from "node:assert/strict";
import {
  dispatchNotification,
  whatsappOpsNumbers,
} from "../src/lib/notifications.ts";
import { prisma } from "../src/lib/prisma";

test("ops numbers parse to digits-only recipients", () => {
  process.env.WHATSAPP_OPS_NUMBERS = "+595 982 109823, 595981123456, short";
  assert.deepEqual(whatsappOpsNumbers(), ["595982109823", "595981123456"]);
  delete process.env.WHATSAPP_OPS_NUMBERS;
  assert.deepEqual(whatsappOpsNumbers(), []);
});

test("whatsapp fans out to client and ops numbers without leaking secrets", async (t) => {
  process.env.WHATSAPP_PROVIDER = "meta";
  process.env.META_WHATSAPP_TOKEN = "fixture-token";
  process.env.META_WHATSAPP_PHONE_NUMBER_ID = "123";
  process.env.META_GRAPH_VERSION = "v22.0";
  process.env.META_WHATSAPP_DEPARTURE_TEMPLATE = "frete_saida_porto_v2";
  process.env.WHATSAPP_OPS_NUMBERS = "+595 982 109823";
  const sentTo: string[] = [];
  const mockFetch = t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      sentTo.push(body.to);
      assert.ok(!JSON.stringify(body).includes("fixture-token"));
      return new Response(
        JSON.stringify({ messages: [{ id: `wamid-${body.to}` }] }),
      );
    },
  );
  const originalFind = prisma.notification.findUnique;
  const originalUpdate = prisma.notification.update;
  const originalUpdateMany = prisma.notification.updateMany;
  const fixture = {
    id: "n-wa",
    status: "PENDING",
    kind: "DEPARTURE",
    to: "+595981111111",
    parameters: JSON.stringify(["C", "CODE", "x", "D", "E", "L"]),
    container: {
      code: "CODE",
      origin: "O",
      destination: "D",
      departedAt: null,
      truckPlate: "ABC1234",
      trailerPlate: null,
      client: { name: "C", consent: true },
      driver: null,
    },
  };
  prisma.notification.findUnique = (async () => fixture) as unknown as typeof originalFind;
  prisma.notification.updateMany = (async () => ({ count: 1 })) as unknown as typeof originalUpdateMany;
  prisma.notification.update = (async ({ data }: { data: object }) => ({
    ...fixture,
    ...data,
  })) as unknown as typeof originalUpdate;
  t.after(() => {
    mockFetch.mock.restore();
    prisma.notification.findUnique = originalFind;
    prisma.notification.update = originalUpdate;
    prisma.notification.updateMany = originalUpdateMany;
    delete process.env.WHATSAPP_PROVIDER;
    delete process.env.META_WHATSAPP_TOKEN;
    delete process.env.META_WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.META_GRAPH_VERSION;
    delete process.env.META_WHATSAPP_DEPARTURE_TEMPLATE;
    delete process.env.WHATSAPP_OPS_NUMBERS;
  });
  const result = (await dispatchNotification("n-wa")) as {
    status: string;
    provider: string;
    providerRef: string;
    error: string | null;
  };
  assert.deepEqual(sentTo, ["595981111111", "595982109823"]);
  assert.equal(result.status, "ACCEPTED");
  assert.equal(result.provider, "meta");
  assert.equal(result.providerRef, "wamid-595981111111");
  assert.equal(result.error, null);
});
