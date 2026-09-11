import { test } from "node:test";
import assert from "node:assert/strict";
import {
  documentFieldsSchema,
  emptyFields,
  detectDocumentType,
} from "../src/lib/document-fields.ts";
test("validates reviewed freight amount independently of cargo value", () => {
  const fields = {
    ...emptyFields,
    clientName: "MELLA S.A.",
    code: "FCIU7453117",
    driverName: "Motorista teste",
    truckPlate: "AAME814",
    trailerPlate: "AAUR582",
    crt: "BR366200277",
    freightValue: "2200.00",
    freightCurrency: "USD",
  };
  assert.equal(documentFieldsSchema.parse(fields).freightValue, "2200.00");
  assert.equal(
    documentFieldsSchema.safeParse({ ...fields, freightCurrency: "" }).success,
    false,
  );
  assert.equal(
    documentFieldsSchema.safeParse({ ...fields, freightValue: "2.200,00" })
      .success,
    false,
  );
  assert.equal(
    documentFieldsSchema.safeParse({ ...fields, code: "ilegível" }).success,
    false,
  );
});
test("uses actual file signatures rather than filename or claimed MIME", () => {
  assert.equal(detectDocumentType(Buffer.from("%PDF-1.7")), "application/pdf");
  assert.equal(
    detectDocumentType(Buffer.from([255, 216, 255, 224])),
    "image/jpeg",
  );
  assert.equal(
    detectDocumentType(Buffer.from("<script>fake.pdf</script>")),
    null,
  );
});
