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
