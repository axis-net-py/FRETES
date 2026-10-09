import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estimateRouteHours,
  findParanaguaGate,
  findPortGate,
  routePlanning,
} from "../src/lib/route-estimate.ts";

test("stores route and configurable positive margin separately", () => {
  assert.deepEqual(routePlanning(3600, 1.5), {
    routeDurationSeconds: 3600,
    operationalMarginSeconds: 5400,
    transitHours: 3,
  });
  for (const margin of [0, -1, NaN, Infinity, 241])
    assert.throws(() => routePlanning(3600, margin));
});

test("estimates a truck route and adds four whole hours", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.includes("/geocode/search"))
      return new Response(
        JSON.stringify({
          features: [{ geometry: { coordinates: [-54.6, -25.5] } }],
        }),
        { status: 200 },
      );
    return new Response(
      JSON.stringify({ routes: [{ summary: { duration: 39_601 } }] }),
      { status: 200 },
    );
  };

  const hours = await estimateRouteHours(
    { latitude: -25.515, longitude: -48.522 },
    "Ciudad del Este, Paraguay",
    "test-key",
    fakeFetch,
  );

  assert.deepEqual(hours, {
    routeDurationSeconds: 39601,
    operationalMarginSeconds: 14400,
    transitHours: 16,
  });
  assert.match(requests[0].url, /geocode\/search/);
  assert.match(requests[0].url, /Ciudad(?:\+|%20)del(?:\+|%20)Este/);
  assert.match(requests[1].url, /directions\/driving-hgv/);
  assert.equal(
    (requests[1].init?.headers as Record<string, string>).Authorization,
    "test-key",
  );
});

test("rejects destinations that cannot be located", async () => {
  const fakeFetch = async () =>
    new Response(JSON.stringify({ features: [] }), { status: 200 });

  await assert.rejects(
    estimateRouteHours(
      { latitude: -25.515, longitude: -48.522 },
      "Destino inexistente",
      "test-key",
      fakeFetch,
    ),
    /Destino não localizado/,
  );
});

test("selects the active Paranagua port gate", () => {
  const gate = findParanaguaGate([
    {
      id: "inactive",
      name: "Porto de Paranaguá",
      active: false,
      latitude: 0,
      longitude: 0,
    },
    {
      id: "other",
      name: "Outro portão",
      active: true,
      latitude: 0,
      longitude: 0,
    },
    {
      id: "paranagua",
      name: "PORTO DE PARANAGUA",
      active: true,
      latitude: -25.515,
      longitude: -48.522,
    },
  ]);
  assert.equal(gate?.id, "paranagua");
});

test("findPortGate selects Santos gate when origin mentions Santos and falls back to Paranagua", () => {
  const gates = [
    {
      id: "paranagua",
      name: "Porto de Paranaguá",
      active: true,
      latitude: -25.5005,
      longitude: -48.5135,
    },
    {
      id: "santos",
      name: "Porto de Santos",
      active: true,
      latitude: -23.94215,
      longitude: -46.31056,
    },
  ];

  const santosGate = findPortGate(gates, "Porto de Santos");
  assert.equal(santosGate?.id, "santos");

  const santosShortGate = findPortGate(gates, "SANTOS - SP");
  assert.equal(santosShortGate?.id, "santos");

  const defaultGate = findPortGate(gates, "China");
  assert.equal(defaultGate?.id, "paranagua");

  const nullGate = findPortGate(gates, null);
  assert.equal(nullGate?.id, "paranagua");
});

