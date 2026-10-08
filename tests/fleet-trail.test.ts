import test from "node:test";
import assert from "node:assert/strict";
import { normalizePlate } from "../src/lib/fleet";

test("normalizePlate cleans plates accurately", () => {
  assert.equal(normalizePlate("AAME-593"), "AAME593");
  assert.equal(normalizePlate("aame 593"), "AAME593");
  assert.equal(normalizePlate("AA-UT-382"), "AAUT382");
});
