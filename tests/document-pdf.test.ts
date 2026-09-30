import test from "node:test";
import assert from "node:assert/strict";
import { repairTripsFromText } from "../src/lib/document-pdf.ts";
import { emptyFields } from "../src/lib/document-fields.ts";

const trip = (fields: Record<string, string>, warning = "") => ({
  fields: { ...emptyFields, ...fields },
  warning,
});

test("repair fills containers and passages 1:1 in document order", () => {
  const text = [
    "Nº BR366200409",
    "NUMERO DO CONTAINER: FSCU8621533 - LACRE: OOLLFV7339",
    "MIC-DTA DE PASSAGEM: 26/0458391-1 - 1a PARCIAL",
    "Nº BR366200410",
    "NÚMERO DO CONTAINER: OOCU7205410 - LACRE: OOLLFV7333",
    "MIC-DTA DE PASSAGEM: 26/0458395-4 - 2a PARCIAL",
  ].join("\n");
  const repaired = repairTripsFromText(
    [trip({ driverName: "A" }), trip({ driverName: "B" })],
    text,
  );
  assert.equal(repaired[0].fields.code, "FSCU8621533");
  assert.equal(repaired[0].fields.micDta, "26/0458391-1");
  assert.equal(repaired[1].fields.code, "OOCU7205410");
  assert.equal(repaired[1].fields.micDta, "26/0458395-4");
  assert.equal(repaired[0].fields.driverName, "A");
  assert.ok(repaired[0].warning.includes("confira se corresponde"));
});

test("repair never fills on count mismatch and keeps filled trips", () => {
  const text = "NUMERO DO CONTAINER: FSCU8621533\nNUMERO DO CONTAINER: OOCU7205410";
  const repaired = repairTripsFromText(
    [trip({ driverName: "A" }), trip({ driverName: "B" }), trip({ driverName: "C" })],
    text,
  );
  assert.ok(repaired.every((item) => !item.fields.code));
  const kept = repairTripsFromText(
    [trip({ code: "TRHU4309424", driverName: "D" }), trip({ driverName: "E" })],
    "NUMERO DO CONTAINER: TRHU4309424\nNUMERO DO CONTAINER: TRHU5254305",
    );
  assert.equal(kept[0].fields.code, "TRHU4309424");
  assert.equal(kept[1].fields.code, "TRHU5254305");
  assert.deepEqual(repairTripsFromText([trip({ driverName: "A" })], ""), [
    trip({ driverName: "A" }),
  ]);
});

test("repair fills trailerPlate when truckPlate is known and plates exist in text", () => {
  const text = [
    "11 Placa del camión: AARG801",
    "15 Semi Remolque: AAOA125",
    "TIPO DE BULTOS: SOLTA",
  ].join("\n");
  const repaired = repairTripsFromText(
    [trip({ truckPlate: "AARG801", micDta: "BR366200452" })],
    text,
  );
  assert.equal(repaired[0].fields.trailerPlate, "AAOA125");
  assert.equal(repaired[0].fields.truckPlate, "AARG801");
  assert.equal(repaired[0].fields.code, "CS-BR366200452");
});

test("fallbackExtractFromPdfText extracts fields when AI quota is exceeded", () => {
  const sampleText = `
    MIC DTA 26/0478404-6
    DRF.PORTO DE PARANAGUA
    PATRICIA CAROLINA RIVAS GUERIN
    AVDA. CACIQUE LAMBARE 4044 LAMBARE / PARAGUAY. RUC: 2578598-2
    COLONIA TIROL - ITAPÚA - PARAGUAY
    ELTON RODRIGUES DA SILVA
    MARCOS TASSI ERNESTINA CI: 4298817
    15 Semi Remolque AAOA125
    11 Placa del camión AARG801
    SOLTA 2
    49.484,56 2.500,00 123,71
    USD
  `;
  const { fallbackExtractFromPdfText } = require("../src/lib/document-pdf.ts");
  const trips = fallbackExtractFromPdfText(sampleText);
  assert.equal(trips.length, 1);
  const f = trips[0].fields;
  assert.equal(f.code, "CS-26/0478404-6");
  assert.equal(f.micDta, "26/0478404-6");
  assert.equal(f.truckPlate, "AARG801");
  assert.equal(f.trailerPlate, "AAOA125");
  assert.equal(f.clientName, "PATRICIA CAROLINA RIVAS GUERIN");
  assert.equal(f.driverName, "MARCOS TASSI ERNESTINA");
  assert.equal(f.freightValue, "2500.00");
  assert.equal(f.freightCurrency, "USD");
  assert.equal(f.origin, "Porto de Paranaguá");
  assert.equal(f.destination, "COLONIA TIROL - ITAPUA - PARAGUAY");
});

