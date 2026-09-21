export type RouteOrigin = {
  latitude: number;
  longitude: number;
};

export type GateCandidate = RouteOrigin & {
  id: string;
  name: string;
  active: boolean;
};

export function findParanaguaGate<T extends GateCandidate>(gates: T[]) {
  return gates.find((gate) => {
    const name = gate.name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
    return gate.active && name.includes("PARANAGUA");
  });
}

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export class RouteEstimateError extends Error {}

export function routePlanning(routeDurationSeconds: number, marginHours = 4) {
  if (!Number.isFinite(marginHours) || marginHours <= 0 || marginHours > 240)
    throw new RouteEstimateError(
      "Configure uma margem operacional entre 0 e 240 horas, maior que zero.",
    );
  const operationalMarginSeconds = Math.ceil(marginHours * 3600);
  return {
    routeDurationSeconds: Math.ceil(routeDurationSeconds),
    operationalMarginSeconds,
    transitHours: Math.ceil(
      (routeDurationSeconds + operationalMarginSeconds) / 3600,
    ),
  };
}

export async function estimateRouteHours(
  origin: RouteOrigin,
  destination: string,
  apiKey: string,
  fetcher: FetchLike = fetch,
  marginHours = 4,
) {
  const headers = { Authorization: apiKey, Accept: "application/json" };
  const geocode = await fetcher(
    "https://api.openrouteservice.org/geocode/search?" +
      new URLSearchParams({
        text: destination,
        "boundary.country": "BR,PY",
        size: "1",
      }),
    { headers, signal: AbortSignal.timeout(12_000) },
  );
  if (!geocode.ok)
    throw new RouteEstimateError(
      "Não foi possível localizar o destino automaticamente.",
    );

  const geocodeResult = await geocode.json();
  const coordinates = geocodeResult.features?.[0]?.geometry?.coordinates;
  if (
    !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    !coordinates.every(Number.isFinite)
  )
    throw new RouteEstimateError(
      "Destino não localizado. Confira o texto extraído do documento.",
    );

  const directions = await fetcher(
    "https://api.openrouteservice.org/v2/directions/driving-hgv",
    {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        coordinates: [[origin.longitude, origin.latitude], coordinates],
      }),
    },
  );
  if (!directions.ok)
    throw new RouteEstimateError(
      "Não foi possível calcular a rota até o destino.",
    );

  const directionsResult = await directions.json();
  const duration = directionsResult.routes?.[0]?.summary?.duration;
  if (!Number.isFinite(duration) || duration <= 0)
    throw new RouteEstimateError("O serviço não retornou uma duração válida.");

  return routePlanning(duration, marginHours);
}
