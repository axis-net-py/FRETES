import test from "node:test";
import assert from "node:assert/strict";
import {
  gateCompleted,
  journeyTarget,
  notificationKindFor,
  eventMessage,
  formatUpdateMessage,
  type JourneyGate,
  type JourneyEvent,
} from "../src/lib/journey.ts";

const gates: JourneyGate[] = [
  { id: "port", kind: "PORT_EXIT", notifyOnEnter: false, notifyOnExit: true },
  { id: "multi", kind: "MULTILOG", notifyOnEnter: true, notifyOnExit: false },
  { id: "entry", kind: "CUSTOMS_ENTRY", notifyOnEnter: true, notifyOnExit: false },
  { id: "exit", kind: "CUSTOMS_EXIT", notifyOnEnter: false, notifyOnExit: true },
];

test("journey advances through checkpoints in creation order", () => {
  assert.equal(journeyTarget(gates, [])?.id, "port");
  assert.equal(
    journeyTarget(gates, [{ geofenceId: "port", type: "ENTER" }])?.id,
    "port",
  );
  const afterPort = [
    { geofenceId: "port", type: "ENTER" },
    { geofenceId: "port", type: "EXIT" },
  ];
  assert.equal(journeyTarget(gates, afterPort)?.id, "multi");
  assert.equal(
    journeyTarget(gates, [...afterPort, { geofenceId: "multi", type: "ENTER" }])?.id,
    "entry",
  );
  assert.equal(
    journeyTarget([] as JourneyGate[], [] as JourneyEvent[])?.id,
    undefined,
  );
  assert.equal(
    gateCompleted(gates[0], [{ geofenceId: "port", type: "ENTER" }]),
    false,
  );
  assert.equal(
    gateCompleted(gates[1], [{ geofenceId: "multi", type: "ENTER" }]),
    true,
  );
});

test("notification kinds and professional messages map per checkpoint", () => {
  assert.equal(notificationKindFor("PORT_EXIT", "EXIT"), "DEPARTURE");
  assert.equal(notificationKindFor("MULTILOG", "ENTER"), "MULTILOG_ARRIVAL");
  assert.equal(notificationKindFor("CUSTOMS_ENTRY", "ENTER"), "CUSTOMS_ENTRY");
  assert.equal(notificationKindFor("CUSTOMS_EXIT", "EXIT"), "CUSTOMS_EXIT");
  assert.equal(notificationKindFor("CUSTOM", "ENTER"), "CUSTOM_ENTER");
  const departure = eventMessage("DEPARTURE");
  assert.ok(departure.eventText.includes("acaba de sair do Porto de Paranaguá"));
  assert.equal(departure.subject, "Saída do porto");
  const arrival = eventMessage("MULTILOG_ARRIVAL");
  assert.ok(arrival.eventText.includes("acaba de chegar à Multilog"));
  assert.ok(arrival.headline.includes("Multilog"));
  const anonymous = eventMessage("CUSTOMS_EXIT");
  assert.ok(anonymous.eventText.includes("aduana paraguaia"));
});

test("formatUpdateMessage leads with cargo state, no client greeting", () => {
  const text = formatUpdateMessage([
    "container OOCU7205410 (lacre OOLLFV7339)",
    "acaba de sair do Porto de Paranaguá e iniciou o trajeto",
    "ADRIANO VENTURA com caminhão AASZ042 / ABBKO34",
    "COTRIPAR com destino SANTA RITA - PY",
    "27/09/2026 06:14",
    "https://axis-fretes.vercel.app/acompanhar#abc",
  ]);
  assert.ok(!text.startsWith("Olá"));
  assert.ok(text.includes("a carga container OOCU7205410 (lacre OOLLFV7339)"));
  assert.ok(text.includes("Motorista ADRIANO VENTURA com caminhão"));
  assert.ok(text.includes("em direção ao cliente COTRIPAR com destino"));
  assert.ok(text.includes("Previsão de chegada: 27/09/2026 06:14."));
  assert.ok(text.endsWith("Acompanhe o trajeto: https://axis-fretes.vercel.app/acompanhar#abc."));
});
