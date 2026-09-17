import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estimateRouteHours,
  findParanaguaGate,
} from "../src/lib/route-estimate.ts";

test("estimates a truck route and adds four whole hours", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch = async (input: string | URL | Request, init?: RequestInit) => {
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

  assert.equal(hours, 16);
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
    { id: "other", name: "Outro portão", active: true, latitude: 0, longitude: 0 },
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
