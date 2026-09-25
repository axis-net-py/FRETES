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
