import test from "node:test";
import assert from "node:assert/strict";
import {
  gateCompleted,
  destinationGateMatches,
  journeyGatesFor,
  journeyTarget,
  notificationKindFor,
  eventMessage,
  formatEventAt,
  formatUpdateMessage,
  isContainerCode,
  portGateKindFor,
  type JourneyGate,
  type JourneyEvent,
} from "../src/lib/journey.ts";

const gates: JourneyGate[] = [
  { id: "port", kind: "PORT_EXIT", notifyOnEnter: false, notifyOnExit: true },
  { id: "multi", kind: "MULTILOG", notifyOnEnter: true, notifyOnExit: false },
  { id: "entry", kind: "CUSTOMS_ENTRY", notifyOnEnter: true, notifyOnExit: false },
  { id: "exit", kind: "CUSTOMS_EXIT", notifyOnEnter: false, notifyOnExit: true },
];

const portGates: JourneyGate[] = [
  { id: "tpc", kind: "PORT_EXIT", notifyOnEnter: false, notifyOnExit: true },
  { id: "appa", kind: "APPA", notifyOnEnter: false, notifyOnExit: true },
  { id: "multi", kind: "MULTILOG", notifyOnEnter: true, notifyOnExit: false },
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

test("port gate follows the freight document: TPC for containers, APPA for loose cargo", () => {
  assert.equal(isContainerCode("OOCU7205410"), true);
  assert.equal(isContainerCode("CS-BR366200452"), false);
  assert.equal(isContainerCode(""), false);
  assert.equal(portGateKindFor("OOCU7205410"), "PORT_EXIT");
  assert.equal(portGateKindFor("CS-BR366200452"), "APPA");
  // Loose cargo skips TPC and starts at APPA.
  assert.equal(journeyTarget(portGates, [], "CS-BR366200452")?.id, "appa");
  // Containers skip APPA and start at TPC.
  assert.equal(journeyTarget(portGates, [], "OOCU7205410")?.id, "tpc");
  // Production creation order (APPA last) still starts loose cargo at APPA.
  const prodOrder: JourneyGate[] = [
    { id: "tpc", kind: "PORT_EXIT", notifyOnEnter: false, notifyOnExit: true },
    { id: "multi", kind: "MULTILOG", notifyOnEnter: true, notifyOnExit: false },
    { id: "entry", kind: "CUSTOMS_ENTRY", notifyOnEnter: true, notifyOnExit: false },
    { id: "exit", kind: "CUSTOMS_EXIT", notifyOnEnter: false, notifyOnExit: true },
    { id: "appa", kind: "APPA", notifyOnEnter: false, notifyOnExit: true },
  ];
  assert.equal(journeyTarget(prodOrder, [], "CS-BR366200452")?.id, "appa");
  assert.equal(journeyTarget(prodOrder, [], "OOCU7205410")?.id, "tpc");
  // After the correct port exit, both flows continue to Multilog.
  assert.equal(
    journeyTarget(
      portGates,
      [{ geofenceId: "appa", type: "EXIT" }],
      "CS-BR366200452",
    )?.id,
    "multi",
  );
  assert.equal(
    journeyTarget(
      prodOrder,
      [{ geofenceId: "tpc", type: "EXIT" }],
      "OOCU7205410",
    )?.id,
    "multi",
  );
  // Single port gate still applies regardless of cargo (legacy setups).
  assert.equal(journeyTarget(gates, [], "CS-BR366200452")?.id, "port");
  assert.equal(journeyTarget(gates, [], "OOCU7205410")?.id, "port");
  assert.equal(notificationKindFor("APPA", "EXIT"), "DEPARTURE");
});

test("notification kinds and professional messages map per checkpoint", () => {
  assert.equal(notificationKindFor("PORT_EXIT", "EXIT"), "DEPARTURE");
  assert.equal(notificationKindFor("APPA", "EXIT"), "DEPARTURE");
  assert.equal(notificationKindFor("MULTILOG", "ENTER"), "MULTILOG_ARRIVAL");
  assert.equal(notificationKindFor("MULTILOG", "EXIT"), "MULTILOG_DEPARTURE");
  assert.equal(notificationKindFor("CUSTOMS_ENTRY", "ENTER"), "CUSTOMS_ENTRY");
  assert.equal(notificationKindFor("CUSTOMS_EXIT", "EXIT"), "CUSTOMS_EXIT");
  assert.equal(notificationKindFor("CUSTOM", "ENTER"), "CUSTOM_ENTER");
  const departure = eventMessage("DEPARTURE");
  assert.ok(departure.eventText.includes("saiu do Porto de Paranaguá"));
  assert.ok(!departure.eventText.includes("acaba de"));
  assert.equal(departure.subject, "Saída do porto");
  const multiDeparture = eventMessage("MULTILOG_DEPARTURE");
  assert.ok(multiDeparture.eventText.includes("liberado da Multilog"));
  assert.equal(multiDeparture.subject, "Saída da Multilog");
  const arrival = eventMessage("MULTILOG_ARRIVAL");
  assert.ok(arrival.eventText.includes("chegou à Multilog"));
  assert.ok(arrival.headline.includes("Multilog"));
  const anonymous = eventMessage("CUSTOMS_EXIT");
  assert.ok(anonymous.eventText.includes("aduana paraguaia"));
});

test("event text carries the GPS event date so late notices stay truthful", () => {
  const at = new Date("2026-10-01T22:07:02.000Z");
  const arrival = eventMessage("MULTILOG_ARRIVAL", at);
  assert.ok(arrival.eventText.includes("chegou à Multilog em 01/10/2026 às 19:07"));
  const departure = eventMessage("DEPARTURE", new Date("2026-09-30T23:32:34.000Z"));
  assert.ok(departure.eventText.includes("saiu do Porto de Paranaguá e iniciou o trajeto em 30/09/2026 às 20:32"));
  assert.equal(formatEventAt(undefined), "");
  assert.equal(formatEventAt(new Date("invalid")), "");
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

test("loose cargo message uses the freight identifier, plates stay with the crew", () => {
  const text = formatUpdateMessage([
    "CS-BR366200452",
    "acaba de sair do Porto de Paranaguá e iniciou o trajeto",
    "MARCOS TASSI com caminhão AARG801 / AAOA125",
    "PATRICIA CAROLINA RIVAS GUERIN com destino COLONIA TIROL - ITAPUA - PARAGUAY",
    "01/10/2026, 20:32",
    "",
  ]);
  assert.ok(text.includes("a carga CS-BR366200452 acaba de sair"));
  assert.ok(!text.includes("a carga AARG801"));
  assert.ok(text.includes("MARCOS TASSI com caminhão AARG801 / AAOA125"));
});

test("destination gate matching identifies destination city and ignores non-matching gates", () => {
  const santaRitaGate: JourneyGate = {
    id: "sr",
    name: "Santa Rita · Destino",
    kind: "DESTINATION",
    notifyOnEnter: true,
    notifyOnExit: true,
  };
  const cdeGate: JourneyGate = {
    id: "cde",
    name: "Ciudad del Este · Destino",
    kind: "DESTINATION",
    notifyOnEnter: true,
    notifyOnExit: true,
  };
  const hernandariasGate: JourneyGate = {
    id: "hern",
    name: "Hernandarias · Destino",
    kind: "DESTINATION",
    notifyOnEnter: true,
    notifyOnExit: true,
  };
  const katueteGate: JourneyGate = {
    id: "kat",
    name: "Katueté · Destino",
    kind: "DESTINATION",
    notifyOnEnter: true,
    notifyOnExit: true,
  };
  const tirolGate: JourneyGate = {
    id: "tirol",
    name: "Colonia Tirol · Destino",
    kind: "DESTINATION",
    notifyOnEnter: true,
    notifyOnExit: true,
  };

  assert.equal(
    destinationGateMatches(santaRitaGate, "SANTA RITA - PY"),
    true,
  );
  assert.equal(
    destinationGateMatches(santaRitaGate, "KATUETE - PARAGUAY"),
    false,
  );
  assert.equal(
    destinationGateMatches(
      cdeGate,
      "SHOPPING INTERNATIONAL SALA 6ª 16, CIUDAD DEL ESTE, PY",
    ),
    true,
  );
  assert.equal(
    destinationGateMatches(
      hernandariasGate,
      "CARRETERA RUTA PY 07 - PARQUE INDUSTRIAL SANTA MONICA, MANZANA 4, LOTE 23 - HERNANDARIAS - PARAGUAY",
    ),
    true,
  );
  assert.equal(
    destinationGateMatches(katueteGate, "KATUETE - PARAGUAY"),
    true,
  );
  assert.equal(
    destinationGateMatches(
      tirolGate,
      "COLONIA TIROL - ITAPUA - PARAGUAY",
    ),
    true,
  );
  assert.equal(
    destinationGateMatches(santaRitaGate, undefined, "sr"),
    true,
  );
});

test("journey targets matching destination gate after customs exit, completing on destination exit", () => {
  const allGates: JourneyGate[] = [
    { id: "port", name: "Paranaguá", kind: "PORT_EXIT", notifyOnEnter: false, notifyOnExit: true },
    { id: "multi", name: "Multilog", kind: "MULTILOG", notifyOnEnter: true, notifyOnExit: false },
    { id: "entry", name: "Aduana Entrada", kind: "CUSTOMS_ENTRY", notifyOnEnter: true, notifyOnExit: false },
    { id: "exit", name: "Aduana Saída", kind: "CUSTOMS_EXIT", notifyOnEnter: false, notifyOnExit: true },
    { id: "sr", name: "Santa Rita · Destino", kind: "DESTINATION", notifyOnEnter: true, notifyOnExit: true },
    { id: "kat", name: "Katueté · Destino", kind: "DESTINATION", notifyOnEnter: true, notifyOnExit: true },
  ];

  // For a freight destined to Katueté, only the Katueté destination gate should be part of the route
  const gatesForKatuete = journeyGatesFor(allGates, "PCIU1234567", "KATUETE - PARAGUAY");
  assert.equal(gatesForKatuete.map((g) => g.id).join(","), "port,multi,entry,exit,kat");

  // Before customs exit, target is port/multi/customs
  const events: JourneyEvent[] = [
    { geofenceId: "port", type: "EXIT" },
    { geofenceId: "multi", type: "ENTER" },
    { geofenceId: "entry", type: "ENTER" },
  ];
  assert.equal(
    journeyTarget(allGates, events, "PCIU1234567", "KATUETE - PARAGUAY")?.id,
    "exit",
  );

  // After customs exit, target is Katueté destination gate!
  events.push({ geofenceId: "exit", type: "EXIT" });
  assert.equal(
    journeyTarget(allGates, events, "PCIU1234567", "KATUETE - PARAGUAY")?.id,
    "kat",
  );

  // After destination entry, gate is not completed yet because notifyOnExit is true
  events.push({ geofenceId: "kat", type: "ENTER" });
  assert.equal(
    journeyTarget(allGates, events, "PCIU1234567", "KATUETE - PARAGUAY")?.id,
    "kat",
  );

  // After destination exit, journey is 100% completed!
  events.push({ geofenceId: "kat", type: "EXIT" });
  assert.equal(
    journeyTarget(allGates, events, "PCIU1234567", "KATUETE - PARAGUAY"),
    null,
  );
});

test("destination arrival and departure notifications format correctly", () => {
  assert.equal(notificationKindFor("DESTINATION", "ENTER"), "DESTINATION_ARRIVAL");
  assert.equal(notificationKindFor("DESTINATION", "EXIT"), "DESTINATION_DEPARTURE");

  const at = new Date("2026-10-07T14:30:00.000Z");
  const arrival = eventMessage("DESTINATION_ARRIVAL", at);
  assert.ok(arrival.eventText.includes("chegou à cidade de destino"));
  assert.equal(arrival.subject, "Chegada ao destino");

  const departure = eventMessage("DESTINATION_DEPARTURE", at);
  assert.ok(departure.eventText.includes("saiu da cidade de destino"));
  assert.equal(departure.subject, "Saída do destino");
  assert.ok(departure.headline.includes("frete concluído"));
});

