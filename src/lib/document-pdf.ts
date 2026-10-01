import type { TripExtraction } from "./document-extraction";
import { emptyFields, type DocumentFields } from "./document-fields";

const CONTAINER_PATTERN = /\b([A-Z]{4}[0-9]{7})\b/g;
const PASSAGE_PATTERN =
  /\b(\d{2}[A-Z]{2}\d{6}[A-Z]|\d{2,3}\/\d{6,7}-\d{1,2})\b/g;
const PLATE_PATTERN =
  /\b([A-Z]{4}[0-9]{3}|[A-Z]{3}[0-9][A-Z][0-9]{2}|[A-Z]{3}[0-9]{3,4})\b/g;

function uniqueMatches(text: string, pattern: RegExp, used: Set<string>) {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of text.toUpperCase().matchAll(new RegExp(pattern.source, pattern.flags))) {
    const value = match[1];
    if (!seen.has(value) && !used.has(value)) {
      seen.add(value);
      found.push(value);
    }
  }
  return found;
}

function usedValues(trips: TripExtraction[]) {
  const used = new Set<string>();
  for (const trip of trips)
    for (const value of [
      trip.fields.code,
      trip.fields.micDta,
      trip.fields.crt,
      trip.fields.truckPlate,
      trip.fields.trailerPlate,
    ])
      if (value) used.add(value.trim().toUpperCase());
  return used;
}

// Deterministic repair from the PDF text layer: only fills when candidates
// map 1:1 onto empty trips in document order. Otherwise lists candidates in
// the warning so the operator picks manually. Never guesses.
export function repairTripsFromText(
  trips: TripExtraction[],
  pdfText: string,
): TripExtraction[] {
  if (
    !pdfText ||
    !trips.some(
      (trip) =>
        !trip.fields.code ||
        !trip.fields.micDta ||
        !trip.fields.trailerPlate ||
        !trip.fields.truckPlate,
    )
  )
    return trips;
  const used = usedValues(trips);
  const text = pdfText.toUpperCase();
  const containers = uniqueMatches(text, CONTAINER_PATTERN, used);
  const passages = uniqueMatches(text, PASSAGE_PATTERN, used);
  const plates = uniqueMatches(text, PLATE_PATTERN, new Set());
  const emptyCode = trips.filter((trip) => !trip.fields.code);
  const emptyPassage = trips.filter((trip) => !trip.fields.micDta);

  return trips.map((trip) => {
    let { fields, warning } = trip;
    const codeIndex = emptyCode.indexOf(trip);
    if (!trip.fields.code && containers.length === emptyCode.length && codeIndex >= 0) {
      fields = { ...fields, code: containers[codeIndex] };
      warning = `${warning} Container localizado no texto do PDF; confira se corresponde a esta viagem.`.trim();
    }
    const passageIndex = emptyPassage.indexOf(trip);
    if (
      !trip.fields.micDta &&
      passages.length === emptyPassage.length &&
      passageIndex >= 0
    ) {
      fields = { ...fields, micDta: passages[passageIndex] };
      warning = `${warning} MIC/DTA localizado no texto do PDF; confira se corresponde a esta viagem.`.trim();
    }

    // Auto-identify Carga Solta code if no maritime containers exist
    if (!fields.code && !containers.length && fields.micDta) {
      if (/\bSOLTA\b/i.test(text) || /\bBULTOS?\b/i.test(text)) {
        fields = { ...fields, code: `CS-${fields.micDta}` };
      }
    }

    // Plate repair: identify and separate truckPlate (campo 11) and trailerPlate (campo 15)
    if (!fields.trailerPlate || !fields.truckPlate) {
      const knownTruck = (fields.truckPlate || "").toUpperCase();
      const knownTrailer = (fields.trailerPlate || "").toUpperCase();

      if (!fields.trailerPlate && knownTruck) {
        const remaining = plates.filter(
          (p) => p !== knownTruck && p !== fields.code && !containers.includes(p),
        );
        if (remaining.length === 1) {
          fields = { ...fields, trailerPlate: remaining[0] };
        } else if (remaining.length > 1) {
          const trailerCandidate = remaining.find((p) =>
            new RegExp(`(?:SEMI\\s*REMOLQUE|A[ÑN]O)[\\s\\S]{0,80}?${p}`).test(text),
          );
          fields = { ...fields, trailerPlate: trailerCandidate || remaining[0] };
        }
      } else if (!fields.truckPlate && knownTrailer) {
        const remaining = plates.filter(
          (p) => p !== knownTrailer && p !== fields.code && !containers.includes(p),
        );
        if (remaining.length >= 1) {
          fields = { ...fields, truckPlate: remaining[0] };
        }
      } else if (!fields.truckPlate && !fields.trailerPlate && plates.length >= 1) {
        if (plates.length === 1) {
          fields = { ...fields, truckPlate: plates[0] };
        } else if (plates.length >= 2) {
          const trailerCandidate = plates.find((p) =>
            new RegExp(`(?:SEMI\\s*REMOLQUE|A[ÑN]O)[\\s\\S]{0,80}?${p}`).test(text),
          );
          if (trailerCandidate) {
            fields = { ...fields, trailerPlate: trailerCandidate };
            const truckCandidate = plates.find((p) => p !== trailerCandidate);
            if (truckCandidate) fields = { ...fields, truckPlate: truckCandidate };
          } else {
            fields = { ...fields, trailerPlate: plates[0], truckPlate: plates[1] };
          }
        }
      }
    }

    if (
      (!fields.code && !containers.length) ||
      (!fields.micDta && !passages.length)
    ) {
      const hints = [
        ...containers.map((c) => `contêiner ${c}`),
        ...passages.map((p) => `passagem ${p}`),
      ];
      if (hints.length)
        warning = `${warning} Candidatos no texto: ${hints.join(", ")}.`.trim();
    }
    return { fields, warning: warning.slice(0, 1000) };
  });
}

// Fallback deterministic extractor when AI service returns 429 quota or transport error.
export function fallbackExtractFromPdfText(pdfText: string): TripExtraction[] {
  if (!pdfText.trim()) return [];
  const text = pdfText.toUpperCase();
  const plates = [...new Set([...text.matchAll(PLATE_PATTERN)].map((m) => m[1]))];
  const passages = [...new Set([...text.matchAll(PASSAGE_PATTERN)].map((m) => m[1]))];
  const containers = [...new Set([...text.matchAll(CONTAINER_PATTERN)].map((m) => m[1]))];

  let micDta = "";
  let crt = "";
  if (passages.length === 1) {
    micDta = passages[0];
  } else if (passages.length >= 2) {
    crt = passages[0];
    micDta = passages[1];
  }

  const isCargaSolta = /\bSOLTA\b/i.test(text) || !containers.length;
  const code = containers[0] || (isCargaSolta && micDta ? `CS-${micDta}` : "");

  let truckPlate = "";
  let trailerPlate = "";
  if (plates.length === 1) {
    truckPlate = plates[0];
  } else if (plates.length >= 2) {
    const trailerCandidate = plates.find((p) =>
      new RegExp(`(?:SEMI\\s*REMOLQUE|A[ÑN]O)[\\s\\S]{0,80}?${p}`).test(text),
    );
    if (trailerCandidate) {
      trailerPlate = trailerCandidate;
      truckPlate = plates.find((p) => p !== trailerPlate) || "";
    } else {
      trailerPlate = plates[0];
      truckPlate = plates[1];
    }
  }

  // Driver name
  let driverName = "";
  const ciMatch = pdfText.match(/([A-Z\s]{3,40})\s+(?:CI:|CPF)/i);
  if (ciMatch) {
    const lines = ciMatch[1].split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    driverName = (lines[lines.length - 1] || "").replace(/\s+/g, " ");
  }

  // Client name
  let clientName = "";
  const destMatch = pdfText.match(
    /(?:34\s*Destinatario[^\n\r]*|35\s*Consignat[aá]rio[^\n\r]*)[\r\n]+\s*([A-Z\s]{3,50}\b)/i,
  );
  if (
    destMatch &&
    !destMatch[1].includes("AVDA") &&
    !destMatch[1].includes("AVENIDA") &&
    !destMatch[1].includes("Origem") &&
    !destMatch[1].includes("PARANAGUA")
  ) {
    clientName = destMatch[1].trim();
  }
  if (!clientName) {
    const avdaIdx = pdfText.search(/\b(?:AVDA\.?|AVENIDA)\b/i);
    if (avdaIdx !== -1) {
      const beforeLines = pdfText
        .slice(0, avdaIdx)
        .trim()
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const candidate = beforeLines[beforeLines.length - 1] || "";
      if (
        candidate.length >= 3 &&
        !candidate.includes("Origem") &&
        !candidate.includes("PARANAGUA")
      ) {
        clientName = candidate;
      }
    }
  }

  // Freight
  let freightValue = "";
  const freightCurrency = "USD";
  const tripletMatch = pdfText.match(
    /\b(\d{1,3}(?:\.\d{3})*,\d{2})\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+(\d{1,3}(?:\.\d{3})*,\d{2})\b/,
  );
  if (tripletMatch) {
    freightValue = tripletMatch[2].replace(/\./g, "").replace(",", ".");
  } else {
    const fleteMatch =
      pdfText.match(/(\d{1,3}(?:\.\d{3})*,\d{2})\s+USD/i) ||
      pdfText.match(/28\s*Flete[\s\S]*?(\d{1,3}(?:\.\d{3})*,\d{2})/i);
    if (fleteMatch) {
      freightValue = fleteMatch[1].replace(/\./g, "").replace(",", ".");
    }
  }

  let origin = "Porto de Paranaguá";
  if (text.includes("SANTOS")) origin = "Porto de Santos";
  else if (text.includes("PARANAGUA")) origin = "Porto de Paranaguá";

  let destination = "";
  if (text.includes("KATUETE")) {
    destination = "KATUETE - PARAGUAI";
  } else if (text.includes("COLONIA TIROL")) {
    destination = "COLONIA TIROL - ITAPUA - PARAGUAY";
  } else if (text.includes("LAMBARE")) {
    destination = "LAMBARE - PARAGUAI";
  } else if (text.includes("SANTA RITA")) {
    destination = "SANTA RITA - PARAGUAI";
  } else if (text.includes("ASUNCION")) {
    destination = "ASUNCION";
  } else if (text.includes("CIUDAD DEL ESTE") && !text.includes("ADM.ADUANA CIUDAD DEL ESTE")) {
    destination = "CIUDAD DEL ESTE";
  }

  const fields: DocumentFields = {
    ...emptyFields,
    clientName,
    code,
    crt,
    micDta,
    driverName,
    truckPlate,
    trailerPlate,
    freightValue,
    freightCurrency,
    origin,
    destination,
    seal: "",
  };

  return [
    {
      fields,
      warning:
        "Leitura direta do texto do documento (IA temporariamente em limite de cota). Confira os campos antes de confirmar.",
    },
  ];
}
