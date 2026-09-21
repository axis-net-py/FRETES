import test from "node:test";
import assert from "node:assert/strict";
import {
  GlobalSatClient,
  GlobalSatError,
  normalizePlate,
  parseGlobalSatDate,
} from "../src/lib/globalsat-client.ts";

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });

test("normalizes plates and parses GlobalSAT local timestamps", () => {
  assert.equal(normalizePlate(" AAM-E814 "), "AAME814");
  assert.equal(
    parseGlobalSatDate("17/09/2026 10:30:00", -3).toISOString(),
    "2026-09-17T13:30:00.000Z",
  );
  assert.throws(() => parseGlobalSatDate("invalid", -3));
});

test("authenticates, validates targets and reuses the OAuth token", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init || {} });
    if (calls.length === 1)
      return json({
        access_token: "token-1",
        token_type: "Bearer",
        expires_in: 86400,
      });
    return json([
      {
        id_target: 2619,
        lic_plate: "AAM-E814",
        gmt_offset: -3,
        position: {
          id_position: 608460878,
          gps_timestamp: "17/09/2026 10:30:00",
          lat: "-25.47733",
          lng: "-54.62238",
        },
      },
    ]);
  };
  const client = new GlobalSatClient(
    { clientId: "client", clientSecret: "secret" },
    fetcher as typeof fetch,
  );
  const first = await client.listTargets();
  const second = await client.listTargets();
  assert.equal(first[0].plate, "AAM-E814");
  assert.equal(
    first[0].position?.recordedAt.toISOString(),
    "2026-09-17T13:30:00.000Z",
  );
  assert.equal(second[0].id, 2619);
  assert.equal(calls.length, 3);
  assert.equal(
    calls[0].url,
    "https://apis.rastreioglobalsat.com/oauth/access_token",
  );
  assert.match(String(calls[0].init.body), /grant_type=client_credentials/);
  assert.equal(
    (calls[0].init.headers as Record<string, string>).Accept,
    "application/json",
  );
  assert.equal(
    (calls[1].init.headers as Record<string, string>).Accept,
    "application/json",
  );
  assert.equal(calls[0].init.redirect, "error");
  assert.equal(calls[1].url, "https://apis.rastreioglobalsat.com/api/targets");
  assert.equal(
    (calls[1].init.headers as Record<string, string>).Authorization,
    "Bearer token-1",
  );
});

test("refreshes the token once after an unauthorized response", async () => {
  let tokenRequests = 0;
  let targetRequests = 0;
  const fetcher = async (input: string | URL | Request) => {
    if (String(input).endsWith("/oauth/access_token")) {
      tokenRequests += 1;
      return json({
        access_token: `token-${tokenRequests}`,
        token_type: "Bearer",
        expires_in: 3600,
      });
    }
    targetRequests += 1;
    return targetRequests === 1 ? json({}, 401) : json([]);
  };
  const client = new GlobalSatClient(
    { clientId: "client", clientSecret: "secret" },
    fetcher as typeof fetch,
  );
  assert.deepEqual(await client.listTargets(), []);
  assert.equal(tokenRequests, 2);
  assert.equal(targetRequests, 2);
});

test("uses date or cursor for tracking reports and sanitizes rate limits", async () => {
  const bodies: string[] = [];
  let rateLimited = false;
  const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).endsWith("/oauth/access_token"))
      return json({
        access_token: "token",
        token_type: "Bearer",
        expires_in: 86400,
      });
    bodies.push(String(init?.body));
    if (rateLimited) return json({ private: "must not leak" }, 429);
    return json({
      NextStartID: 813902583,
      rows: 0,
      status: "ok",
      query_result: [],
    });
  };
  const client = new GlobalSatClient(
    { clientId: "client", clientSecret: "secret" },
    fetcher as typeof fetch,
  );
  await client.getTrackingData({
    targetIds: [5847],
    initialSince: new Date("2026-09-17T12:00:00Z"),
    limit: 100,
  });
  await client.getTrackingData({
    targetIds: [5847],
    fromId: BigInt("813902583"),
    limit: 100,
  });
  assert.match(bodies[0], /id_targets=5847/);
  assert.match(bodies[0], /ini_date=/);
  assert.equal(new URLSearchParams(bodies[0]).get("lang"), "pt");
  assert.doesNotMatch(bodies[0], /from_id=/);
  assert.match(bodies[1], /from_id=813902583/);
  assert.doesNotMatch(bodies[1], /ini_date=/);
  rateLimited = true;
  await assert.rejects(
    client.getTrackingData({
      targetIds: [5847],
      fromId: BigInt(1),
      limit: 100,
    }),
    (error: unknown) =>
      error instanceof GlobalSatError &&
      error.code === "RATE_LIMITED" &&
      !error.message.includes("private"),
  );
});

test("reuses a persisted token across client instances and coalesces concurrent authentication", async () => {
  let cached: { token: string; expiresAt: number } | null = null;
  let tokens = 0;
  const store = {
    load: async () => cached,
    save: async (value: { token: string; expiresAt: number }) => {
      cached = value;
    },
  };
  const fetcher: typeof fetch = async (input) => {
    if (String(input).endsWith("/oauth/access_token")) {
      tokens++;
      return json({
        access_token: "private-token",
        token_type: "Bearer",
        expires_in: 86400,
      });
    }
    return json([]);
  };
  const config = {
    clientId: "fixture-client",
    clientSecret: "fixture-secret",
    tokenStore: store,
  };
  const first = new GlobalSatClient(config, fetcher);
  await Promise.all([first.listTargets(), first.listTargets()]);
  await new GlobalSatClient(config, fetcher).listTargets();
  assert.equal(tokens, 1);
});

test("rejects the obsolete array token contract and masks network failures", async () => {
  const config = { clientId: "fixture-client", clientSecret: "fixture-secret" };
  await assert.rejects(
    new GlobalSatClient(config, async () =>
      json([
        { access_token: "secret", token_type: "Bearer", expires_in: 86400 },
      ]),
    ).listTargets(),
    /INVALID_RESPONSE/,
  );
  await assert.rejects(
    new GlobalSatClient(config, async () => {
      throw new Error("fixture-secret");
    }).listTargets(),
    (e) =>
      e instanceof GlobalSatError &&
      e.code === "TIMEOUT" &&
      !e.message.includes("fixture-secret"),
  );
});
