export type DriverIdentity = {
  id: string;
  name: string;
  plate?: string | null;
};

function normalizedWords(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .match(/[A-Z0-9]+/g) ?? []
  );
}

export function normalizeDriverName(value: string) {
  return normalizedWords(value).sort().join(" ");
}

export function normalizeName(value: string) {
  return normalizedWords(value).join(" ");
}

function smallTypo(a: string, b: string) {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1)
    return false;
  let i = 0,
    j = 0,
    edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

export function driverCandidates<T extends DriverIdentity>(
  drivers: T[],
  name: string,
) {
  const key = normalizeDriverName(name);
  if (!key) return [];
  const exact = drivers.filter((d) => normalizeDriverName(d.name) === key);
  if (exact.length) return exact;
  const words = key.split(" ");
  return drivers.filter((d) => {
    const other = normalizeDriverName(d.name).split(" ");
    return (
      words.length >= 2 &&
      words.length === other.length &&
      words.filter((w, i) => w !== other[i]).length === 1 &&
      words.every((w, i) => smallTypo(w, other[i]))
    );
  });
}

export function normalizePlate(value: string) {
  return normalizedWords(value).join("");
}

export function findMatchingDriver<T extends DriverIdentity>(
  drivers: T[],
  name: string,
  plate: string,
): T | undefined {
  const nameKey = normalizeDriverName(name);
  const plateKey = normalizePlate(plate);
  if (!nameKey) return undefined;

  const sameName = driverCandidates(drivers, name);
  if (sameName.length === 1) return sameName[0];

  if (plateKey) {
    const sameNameAndPlate = sameName.filter(
      (driver) => normalizePlate(driver.plate ?? "") === plateKey,
    );
    if (sameNameAndPlate.length === 1) return sameNameAndPlate[0];
  }

  return undefined;
}
