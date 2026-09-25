import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractDocument,
  DocumentExtractionError,
  documentInstructions,
  sanitizeExtractedFields,
  shouldReExtract,
  toTripExtractions,
} from "../src/lib/document-extraction.ts";
import { documentProvider } from "../src/lib/document-provider.ts";
import {
  documentFieldsSchema,
  emptyFields,
  detectDocumentType,
} from "../src/lib/document-fields.ts";
import {
  driverCandidates,
  findMatchingDriver,
  normalizeName,
} from "../src/lib/driver-match.ts";
test("driver matching tolerates a single long-name typo but never substitutes the plate owner", () => {
  const drivers = [{ id: "1", name: "Claudionor Gonzalez", plate: "ABC1234" }];
  assert.equal(
    findMatchingDriver(drivers, "Claudionor Gonzales", "ABC1234")?.id,
    "1",
  );
  assert.equal(
    findMatchingDriver(drivers, "Pedro Silva", "ABC1234"),
    undefined,
  );
  const ambiguous = [
    ...drivers,
    { id: "2", name: "Gonzalez Claudionor", plate: "ABC1234" },
  ];
  assert.equal(driverCandidates(ambiguous, "Claudionor Gonzalez").length, 2);
  assert.equal(
    findMatchingDriver(ambiguous, "Claudionor Gonzalez", "ABC1234"),
    undefined,
  );
  assert.equal(
    normalizeName("  Transportes   São José S.A. "),
    normalizeName("TRANSPORTES SAO JOSE S A"),
  );
});
test("matches known drivers despite accents, word order and plate punctuation", () => {
  const drivers = [
    { id: "1", name: "González, Claudionor", plate: "AAM-E814" },
    { id: "2", name: "Outro Motorista", plate: "ABC1234" },
  ];
  assert.equal(
    findMatchingDriver(drivers, "CLAUDIONOR GONZALEZ", "AAME814")?.id,
    "1",
  );
  assert.equal(
    findMatchingDriver(drivers, "Motorista Novo", "ZZZ9999"),
    undefined,
  );
});
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

test("extraction rules reject scheduling-guide traps and re-read stale documents", () => {
  for (const rule of [
    "4 letras e 7 números",
    "NÚMERO DO DOCUMENTO",
    "Peso bruto",
    "nunca invente moeda",
    "transportadora nunca é origem",
    "Laden Dely",
    "Guia de Agendamento",
    "português",
  ])
    assert.ok(documentInstructions.includes(rule), `missing rule: ${rule}`);
  assert.equal(shouldReExtract({ promptVersion: 4, trips: [{ fields: { code: "MRSU2904847" }, warning: "" }], warning: "" }, 0), true);
  assert.equal(shouldReExtract({ promptVersion: 5, trips: [{ fields: { code: "MRSU2904847" }, warning: "" }], warning: "" }, 0), false);
  assert.equal(shouldReExtract({ promptVersion: 5, trips: [{ fields: { code: "" }, warning: "" }], warning: "" }, 0), true);
  assert.equal(shouldReExtract({ fields: { code: "2604487211" } }, 0), true);
  assert.equal(shouldReExtract(null, 0), true);
  assert.equal(
    shouldReExtract({ promptVersion: 5, trips: [{ fields: { code: "MRSU2904847" }, warning: "" }], warning: "" }, 2),
    false,
  );
});
test("multi-trip payloads parse per trip and legacy payloads adapt", async (t) => {
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "unit-test-key";
  const mock = t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: "STOP",
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      trips: [
                        { ...emptyFields, code: "FSCU8621533", warning: "" },
                        { ...emptyFields, code: "OOCU7205410", warning: "w" },
                      ],
                      warning: "doc",
                    }),
                  },
                ],
              },
            },
          ],
        }),
      ),
  );
  try {
    const result = await extractDocument(
      Buffer.from("%PDF-1.7"),
      "application/pdf",
    );
    assert.equal(result.trips.length, 2);
    assert.equal(result.trips[0].fields.code, "FSCU8621533");
    assert.equal(result.trips[1].warning, "w");
    assert.equal(result.warning, "doc");
  } finally {
    mock.mock.restore();
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
  assert.deepEqual(toTripExtractions({ fields: { ...emptyFields, code: "X" }, warning: "legacy" }), [
    { fields: { ...emptyFields, code: "X" }, warning: "legacy" },
  ]);
  assert.deepEqual(toTripExtractions(null), []);
});
test("sanitizer strips carrier clients and scheduling numbers without touching valid data", () => {
  const guide = sanitizeExtractedFields({
    ...emptyFields,
    clientName: "MSK - Maersk Lines",
    code: "MRSU2904847",
    micDta: "2604487211",
    driverName: "EDERSON FACHINI",
    truckPlate: "ABCD519",
  });
  assert.equal(guide.fields.clientName, "");
  assert.equal(guide.fields.micDta, "");
  assert.equal(guide.fields.code, "MRSU2904847");
  assert.equal(guide.fields.driverName, "EDERSON FACHINI");
  assert.ok(guide.notes.join(" ").includes("Armador"));
  const dupes = sanitizeExtractedFields({
    ...emptyFields,
    code: "MRSU2904847",
    micDta: "MRSU2904847",
    crt: "MRSU2904847",
  });
  assert.equal(dupes.fields.micDta, "");
  assert.equal(dupes.fields.crt, "");
  const valid = sanitizeExtractedFields({
    ...emptyFields,
    clientName: "Transportes Reais S.A.",
    code: "FCIU7453117",
    micDta: "MIC-TEST",
    crt: "BR366200277",
  });
  assert.equal(valid.fields.clientName, "Transportes Reais S.A.");
  assert.equal(valid.fields.micDta, "MIC-TEST");
  assert.equal(valid.fields.crt, "BR366200277");
  assert.deepEqual(valid.notes, []);
});
test("Gemini trims pasted credentials and distinguishes transport failures", async (t) => {
  const previousKey = process.env.GEMINI_API_KEY;
  const previousModel = process.env.GEMINI_DOCUMENT_MODEL;
  process.env.GEMINI_API_KEY = "  unit-test-key\n";
  process.env.GEMINI_DOCUMENT_MODEL = " gemini-2.5-flash ";
  let seenUrl = "";
  let seenKey = "";
  const mock = t.mock.method(
    globalThis,
    "fetch",
    async (url: string, init: RequestInit) => {
      seenUrl = String(url);
      seenKey = String(
        (init.headers as Record<string, string>)["x-goog-api-key"],
      );
      throw new TypeError("fetch failed");
    },
  );
  try {
    await assert.rejects(
      extractDocument(Buffer.from("%PDF-1.7"), "application/pdf"),
      (e: unknown) =>
        e instanceof DocumentExtractionError &&
        !e.message.includes("unit-test-key") &&
        e.message.includes("chave do Gemini"),
    );
    assert.ok(
      seenUrl.includes("/models/gemini-2.5-flash:generateContent"),
      `model not trimmed: ${seenUrl}`,
    );
    assert.equal(seenKey, "unit-test-key");
  } finally {
    mock.mock.restore();
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.GEMINI_DOCUMENT_MODEL;
    else process.env.GEMINI_DOCUMENT_MODEL = previousModel;
  }
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
                trips: [
                  {
                    ...emptyFields,
                    code: "TEST1234567",
                    warning: "",
                  },
                ],
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
      assert.equal(body.generationConfig.thinkingConfig.thinkingBudget, 0);
      return new Response(JSON.stringify(payload), { status });
    },
  );
  try {
    assert.equal(documentProvider().testOnly, true);
    process.env.GEMINI_DATA_MODE = "paid";
    assert.equal(documentProvider().testOnly, false);
    assert.equal(
      (await extractDocument(Buffer.from("%PDF-1.7"), "application/pdf")).trips[0]
        .fields.code,
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
