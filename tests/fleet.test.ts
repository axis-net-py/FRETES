import test from "node:test";
import assert from "node:assert/strict";
import {
  computeGpsHealth,
  deriveTruckStatus,
  aggregateFleet,
  type RawPositionFix,
} from "../src/lib/fleet";

test("computeGpsHealth handles fresh signal (<30m)", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  const recorded = new Date("2026-10-08T11:57:00Z"); // 3m ago
  const res = computeGpsHealth(recorded, now);
  assert.equal(res.health, "ONLINE");
  assert.equal(res.ageMinutes, 3);
  assert.equal(res.healthLabel, "Sinal há 3m");
});

test("computeGpsHealth handles attention signal (30m - 120m)", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  const recorded = new Date("2026-10-08T11:15:00Z"); // 45m ago
  const res = computeGpsHealth(recorded, now);
  assert.equal(res.health, "ATTENTION");
  assert.equal(res.ageMinutes, 45);
  assert.equal(res.healthLabel, "Atenção: há 45m");
});

test("computeGpsHealth handles offline / stale signal (>120m or null)", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  const recorded = new Date("2026-10-08T08:00:00Z"); // 4h ago
  const res = computeGpsHealth(recorded, now);
  assert.equal(res.health, "OFFLINE");
  assert.equal(res.ageMinutes, 240);
  assert.equal(res.healthLabel, "Sem sinal há 4h");

  const nullRes = computeGpsHealth(null, now);
  assert.equal(nullRes.health, "OFFLINE");
  assert.equal(nullRes.healthLabel, "Sem sinal de GPS");
});

test("deriveTruckStatus derives correct statuses", () => {
  assert.deepEqual(deriveTruckStatus({ status: "EM_TRANSITO" }), {
    status: "EM_VIAGEM",
    statusLabel: "Em Viagem",
  });
  assert.deepEqual(deriveTruckStatus({ status: "A_CAMINHO_DESTINO" }), {
    status: "EM_VIAGEM",
    statusLabel: "Em Viagem",
  });
  assert.deepEqual(deriveTruckStatus({ status: "CHEGADA_PORTAO" }), {
    status: "NO_PORTO",
    statusLabel: "No Porto / Aduana",
  });
  assert.deepEqual(deriveTruckStatus({ status: "LIBERADO" }), {
    status: "NO_PORTO",
    statusLabel: "No Porto / Aduana",
  });
  assert.deepEqual(deriveTruckStatus({ status: "ENTREGUE" }), {
    status: "DISPONIVEL",
    statusLabel: "Disponível",
  });
  assert.deepEqual(deriveTruckStatus(null), {
    status: "DISPONIVEL",
    statusLabel: "Disponível",
  });
});

test("aggregateFleet filters out non-GlobalSat trucks and aggregates active/history", () => {
  const now = new Date("2026-10-08T12:00:00Z");

  const drivers = [
    { id: "d1", name: "LEONARDO GALVALISIS", phone: "123", plate: "AAME593" },
    { id: "d2", name: "OUTSOURCED DRIVER", phone: "456", plate: "OTHER99" },
  ];

  const containers = [
    {
      id: "c1",
      code: "MSNU6732375",
      status: "EM_TRANSITO",
      origin: "CHINA",
      destination: "HERNANDARIAS - PY",
      truckPlate: "AAME593",
      trailerPlate: "AASV276",
      crt: "BR366200298",
      micDta: "BR366200451",
      driverId: "d1",
      updatedAt: "2026-10-08T11:00:00Z",
      client: { name: "COTRIPAR" },
      driver: { id: "d1", name: "LEONARDO GALVALISIS", phone: "123" },
      documentLinks: [
        { document: { id: "doc1", filename: "MIC_BR366200451.pdf" } },
      ],
    },
    {
      id: "c2",
      code: "OLD123",
      status: "ENTREGUE",
      origin: "PORTO",
      destination: "SANTA RITA - PY",
      truckPlate: "AAME593",
      trailerPlate: "AASV276",
      crt: "BR366200281",
      micDta: "BR366200412",
      driverId: "d1",
      updatedAt: "2026-09-25T18:00:00Z",
      client: { name: "COTRIPAR" },
      driver: { id: "d1", name: "LEONARDO GALVALISIS", phone: "123" },
      documentLinks: [],
    },
    {
      id: "c3",
      code: "NON_GLOBALSAT",
      status: "EM_TRANSITO",
      origin: "PORTO",
      destination: "SANTA RITA",
      truckPlate: "OTHER99",
      trailerPlate: "TRAIL99",
      driverId: "d2",
      updatedAt: "2026-10-08T10:00:00Z",
      client: { name: "OUTRO" },
      driver: { id: "d2", name: "OUTSOURCED DRIVER", phone: "456" },
      documentLinks: [],
    },
  ];

  const latestPositions: RawPositionFix[] = [
    {
      id: "p1",
      driverId: "d1",
      containerId: "c1",
      latitude: -25.34686,
      longitude: -52.49161,
      recordedAt: new Date("2026-10-08T11:55:00Z"),
      source: "GLOBALSAT",
      driverPlate: "AAME593",
    },
  ];

  const fleet = aggregateFleet({
    containers,
    drivers,
    latestPositions,
    now,
  });

  // ONLY AAME593 should be included because OTHER99 has no GlobalSat positions!
  assert.equal(fleet.length, 1);
  const truck = fleet[0];
  assert.equal(truck.plate, "AAME593");
  assert.equal(truck.driver?.name, "LEONARDO GALVALISIS");
  assert.equal(truck.status, "EM_VIAGEM");
  assert.equal(truck.lastPosition?.health, "ONLINE");
  assert.equal(truck.lastPosition?.latitude, -25.34686);
  assert.equal(truck.activeFreight?.code, "MSNU6732375");
  assert.equal(truck.activeFreight?.document?.id, "doc1");
  assert.equal(truck.tripHistory.length, 1);
  assert.equal(truck.tripHistory[0].code, "OLD123");
  assert.equal(truck.totalTripsCompleted, 1);
});

test("aggregateFleet includes all 11 AXIS fleet trucks and detects parked truck in company yard", () => {
  const now = new Date("2026-10-08T13:30:00Z");

  const drivers = [
    { id: "d1", name: "LEONARDO GALVALISIS", phone: "", plate: "AAME593" },
    { id: "d2", name: "CLAUDIONOR GONZALEZ", phone: "", plate: "AAME814" },
    { id: "d3", name: "MARCELO VENTURA", phone: "", plate: "AAME899" },
    { id: "d4", name: "VICTOR RAUL", phone: "", plate: "AARG542" },
    { id: "d5", name: "MARCOS TASSI", phone: "", plate: "AARG801" },
    { id: "d6", name: "GILBERTO YEGROS", phone: "", plate: "AASC676" },
    { id: "d7", name: "ADRIANO VENTURA", phone: "", plate: "AASZ042" },
    { id: "d8", name: "EVER STRIEDER", phone: "", plate: "AAUT382" },
    { id: "d9", name: "VALDEMIR MARCOLA", phone: "", plate: "AAYE568" },
    { id: "d10", name: "GUSTAVO RAMON", phone: "", plate: "ABBJ596" },
    { id: "d11", name: "EDERSON FACHINI", phone: "", plate: "ABCD519" },
  ];

  // Marcos Tassi has completed his trip (CS-BR366200452 is ENTREGUE)
  // and is parked at company yard (-24.25666, -54.77191)
  const containers = [
    {
      id: "c-tassi",
      code: "CS-BR366200452",
      status: "ENTREGUE",
      origin: "DRF.PORTO DE PARANAGUA",
      destination: "COLONIA TIROL - ITAPUA - PARAGUAY",
      truckPlate: "AARG801",
      trailerPlate: "AAOA125",
      driverId: "d5",
      updatedAt: "2026-10-08T13:18:00Z",
    },
    {
      id: "c-leo",
      code: "MSNU6732375",
      status: "A_CAMINHO_DESTINO",
      origin: "DRF.PORTO DE PARANAGUA",
      destination: "HERNANDARIAS - PARAGUAY",
      truckPlate: "AAME593",
      driverId: "d1",
      updatedAt: "2026-10-08T13:20:00Z",
    },
  ];

  const latestPositions: RawPositionFix[] = [
    {
      id: "pos-tassi",
      driverId: "d5",
      latitude: -24.25666,
      longitude: -54.77191,
      recordedAt: new Date("2026-10-08T13:17:56Z"),
      source: "GLOBALSAT",
      driverPlate: "AARG801",
    },
    {
      id: "pos-leo",
      driverId: "d1",
      latitude: -25.409,
      longitude: -54.64,
      recordedAt: new Date("2026-10-08T13:25:00Z"),
      source: "GLOBALSAT",
      driverPlate: "AAME593",
    },
  ];

  const fleet = aggregateFleet({
    containers,
    drivers,
    latestPositions,
    now,
  });

  // Exactly 11 trucks must be in the fleet!
  assert.equal(fleet.length, 11);

  // Marcos Tassi must be DISPONIVEL (not Em Viagem) and identified at company yard
  const tassi = fleet.find((t) => t.plate === "AARG801");
  assert.ok(tassi);
  assert.equal(tassi.driver?.name, "MARCOS TASSI");
  assert.equal(tassi.status, "DISPONIVEL");
  assert.equal(tassi.statusLabel, "Disponível");
  assert.equal(tassi.activeFreight, null);
  assert.equal(tassi.tripHistory.length, 1);
  assert.equal(tassi.tripHistory[0].code, "CS-BR366200452");
  assert.equal(tassi.lastPosition?.isAtCompanyYard, true);
  assert.equal(tassi.lastPosition?.healthLabel, "No pátio (estacionado)");

  // Leonardo Galvalisis must be EM_VIAGEM
  const leo = fleet.find((t) => t.plate === "AAME593");
  assert.ok(leo);
  assert.equal(leo.status, "EM_VIAGEM");
  assert.equal(leo.activeFreight?.code, "MSNU6732375");

  // An idle truck without recent positions must be DISPONIVEL
  const claudionor = fleet.find((t) => t.plate === "AAME814");
  assert.ok(claudionor);
  assert.equal(claudionor.driver?.name, "CLAUDIONOR GONZALEZ");
  assert.equal(claudionor.status, "DISPONIVEL");
  assert.equal(claudionor.lastPosition, null);
});

