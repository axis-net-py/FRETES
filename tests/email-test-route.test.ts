import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "../src/app/api/notifications/test/route";
import { createSession, COOKIE } from "../src/lib/session";

test("email test endpoint requires login and configured ops email", async () => {
  process.env.SESSION_SECRET = "fixture-email-test-secret-32-characters";
  const cookie = `${COOKIE}=${await createSession()}`;
  const request = (authenticated = true) =>
    new Request("https://fretes.example/api/notifications/test", {
      method: "POST",
      ...(authenticated ? { headers: { cookie } } : {}),
    });
  assert.equal((await POST(request(false))).status, 401);
  delete process.env.SMTP_HOST;
  assert.equal((await POST(request(true))).status, 503);
});

test("whatsapp test endpoint dispatches template message when requested", async (t) => {
  process.env.SESSION_SECRET = "fixture-email-test-secret-32-characters";
  process.env.WHATSAPP_PROVIDER = "meta";
  process.env.META_WHATSAPP_TOKEN = "fixture-token";
  process.env.META_WHATSAPP_PHONE_NUMBER_ID = "123";
  process.env.META_GRAPH_VERSION = "v22.0";
  process.env.META_WHATSAPP_DEPARTURE_TEMPLATE = "frete_saida_porto_v2";
  const cookie = `${COOKIE}=${await createSession()}`;

  const mockFetch = t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      assert.equal(body.to, "595981111111");
      assert.equal(body.type, "template");
      return new Response(
        JSON.stringify({ messages: [{ id: "wamid-test-123" }] }),
      );
    },
  );

  t.after(() => {
    mockFetch.mock.restore();
    delete process.env.WHATSAPP_PROVIDER;
    delete process.env.META_WHATSAPP_TOKEN;
    delete process.env.META_WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.META_GRAPH_VERSION;
    delete process.env.META_WHATSAPP_DEPARTURE_TEMPLATE;
  });

  const request = new Request("https://fretes.example/api/notifications/test", {
    method: "POST",
    headers: {
      cookie,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel: "whatsapp",
      to: "+595 981 111111",
    }),
  });

  const response = await POST(request);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.equal(data.channel, "whatsapp");
  assert.equal(data.messageId, "wamid-test-123");
  assert.equal(data.to, "595981111111");
});

