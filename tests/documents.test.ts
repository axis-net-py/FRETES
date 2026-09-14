import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractDocument,
  DocumentExtractionError,
} from "../src/lib/document-extraction.ts";
import { documentProvider } from "../src/lib/document-provider.ts";
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

test("Gemini sends inline documents and validates output, quota and refusal without leaking secrets", async (t) => {
  const previousKey = process.env.GEMINI_API_KEY;
  const previousMode = process.env.GEMINI_DATA_MODE;
  process.env.GEMINI_API_KEY = "unit-test-key";
  delete process.env.GEMINI_DATA_MODE;
  let status = 200;
  let payload: unknown = {
    candidates: [
      {
        finishReason: "STOP",
        content: {
          parts: [
            {
              text: JSON.stringify({
                ...emptyFields,
                code: "TEST1234567",
                warning: "",
              }),
            },
          ],
        },
      },
    ],
  };
  const mock = t.mock.method(
    globalThis,
    "fetch",
    async (url: string, init: RequestInit) => {
      assert.ok(
        String(url).startsWith(
          "https://generativelanguage.googleapis.com/v1beta/models/",
        ),
      );
      assert.ok(!String(url).includes("unit-test-key"));
      const body = JSON.parse(String(init.body));
      assert.equal(
        body.contents[0].parts[0].inlineData.mimeType,
        "application/pdf",
      );
      assert.equal(body.generationConfig.responseMimeType, "application/json");
      return new Response(JSON.stringify(payload), { status });
    },
  );
  try {
    assert.equal(documentProvider().testOnly, true);
    process.env.GEMINI_DATA_MODE = "paid";
    assert.equal(documentProvider().testOnly, false);
    assert.equal(
      (await extractDocument(Buffer.from("%PDF-1.7"), "application/pdf")).fields
        .code,
      "TEST1234567",
    );
    status = 429;
    payload = { error: { message: "unit-test-key" } };
    await assert.rejects(
      extractDocument(Buffer.from("%PDF-1.7"), "application/pdf"),
      (e: unknown) =>
        e instanceof DocumentExtractionError &&
        e.status === 429 &&
        !e.message.includes("unit-test-key"),
    );
    status = 200;
    payload = { candidates: [{ finishReason: "MAX_TOKENS" }] };
    await assert.rejects(
      extractDocument(Buffer.from("%PDF-1.7"), "application/pdf"),
      DocumentExtractionError,
    );
    payload = {
      candidates: [
        {
          finishReason: "STOP",
          content: { parts: [{ text: '{"code":123}' }] },
        },
      ],
    };
    await assert.rejects(
      extractDocument(Buffer.from("%PDF-1.7"), "application/pdf"),
      DocumentExtractionError,
    );
  } finally {
    mock.mock.restore();
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
    if (previousMode === undefined) delete process.env.GEMINI_DATA_MODE;
    else process.env.GEMINI_DATA_MODE = previousMode;
  }
});
