import { distanceMeters } from "./geo.ts";
type Fix = {
  latitude: number;
  longitude: number;
  accuracyM: number;
  recordedAt: string;
};
export function reliableOutside(
  input: Fix,
  gate: { latitude: number; longitude: number; radiusM: number },
  now = Date.now(),
) {
  const age = now - new Date(input.recordedAt).getTime();
  return (
    Number.isFinite(age) &&
    age >= -30000 &&
    age <= 120000 &&
    input.accuracyM >= 0 &&
    input.accuracyM <= Math.min(100, gate.radiusM / 2) &&
    distanceMeters(input, gate) - input.accuracyM >= gate.radiusM + 50
  );
}
export function reliableInside(
  input: Fix,
  gate: { latitude: number; longitude: number; radiusM: number },
  now = Date.now(),
) {
  const age = now - new Date(input.recordedAt).getTime();
  return (
    Number.isFinite(age) &&
    age >= -30000 &&
    age <= 120000 &&
    input.accuracyM >= 0 &&
    input.accuracyM <= Math.min(100, gate.radiusM / 2) &&
    distanceMeters(input, gate) + input.accuracyM <= gate.radiusM
  );
}
