import type { TripExtraction } from "./document-extraction";

const CONTAINER_PATTERN = /\b([A-Z]{4}[0-9]{7})\b/g;
const PASSAGE_PATTERN = /\b(\d{2,3}\/\d{6,7}-\d{1,2})\b/g;

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
    for (const value of [trip.fields.code, trip.fields.micDta, trip.fields.crt])
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
  if (!pdfText || !trips.some((trip) => !trip.fields.code || !trip.fields.micDta))
    return trips;
  const used = usedValues(trips);
  const text = pdfText.toUpperCase();
  const containers = uniqueMatches(text, CONTAINER_PATTERN, used);
  const passages = uniqueMatches(text, PASSAGE_PATTERN, used);
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
    if (
      (!trip.fields.code && !containers.length) ||
      (!trip.fields.micDta && !passages.length)
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
