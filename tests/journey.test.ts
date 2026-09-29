import test from "node:test";
import assert from "node:assert/strict";
import {
  gateCompleted,
  journeyTarget,
  notificationKindFor,
  eventMessage,
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
  const crew = "ADRIANO VENTURA · AASZ042 / ABBKO34";
  const departure = eventMessage("DEPARTURE", crew);
  assert.ok(departure.eventText.includes("Porto de Paranaguá"));
  assert.ok(departure.eventText.includes(crew));
  assert.equal(departure.subject, "Saída do porto");
  const arrival = eventMessage("MULTILOG_ARRIVAL", crew);
  assert.ok(arrival.eventText.includes("Multilog"));
  assert.ok(arrival.headline.includes("Multilog"));
  const anonymous = eventMessage("CUSTOMS_EXIT", "");
  assert.ok(!anonymous.eventText.includes("com  e"));
  assert.ok(anonymous.eventText.includes("aduana paraguaia"));
});
