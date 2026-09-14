export type DriverIdentity = {
  id: string;
  name: string;
  plate?: string | null;
};

function normalizedWords(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .match(/[A-Z0-9]+/g) ?? [];
}

export function normalizeDriverName(value: string) {
  return normalizedWords(value).sort().join(" ");
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

  const sameName = drivers.filter(
    (driver) => normalizeDriverName(driver.name) === nameKey,
  );
  if (sameName.length === 1) return sameName[0];

  if (plateKey) {
    const sameNameAndPlate = sameName.filter(
      (driver) => normalizePlate(driver.plate ?? "") === plateKey,
    );
    if (sameNameAndPlate.length === 1) return sameNameAndPlate[0];

    const samePlate = drivers.filter(
      (driver) => normalizePlate(driver.plate ?? "") === plateKey,
    );
    if (samePlate.length === 1) return samePlate[0];
  }

  return undefined;
}
