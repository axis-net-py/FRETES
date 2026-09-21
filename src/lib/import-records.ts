import type { Prisma } from "@prisma/client";
import {
  driverCandidates,
  findMatchingDriver,
  normalizeName,
  normalizePlate,
} from "./driver-match";

export class ImportConflict extends Error {}

export async function resolveImportRecords(
  tx: Prisma.TransactionClient,
  input: {
    clientId: string;
    driverId: string;
    clientName: string;
    driverName: string;
    truckPlate: string;
    trailerPlate: string;
    whatsapp: string;
    consent: boolean;
  },
) {
  // Serialize import matching + creation across processes, including new names.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(73191801)`;
  const clients = input.clientId
    ? []
    : await tx.client.findMany({ select: { id: true, name: true } });
  const matchingClients = clients.filter(
    (c) => normalizeName(c.name) === normalizeName(input.clientName),
  );
  if (matchingClients.length > 1)
    throw new ImportConflict(
      "Há clientes com nomes equivalentes. Selecione o cadastro correto.",
    );
  const client = input.clientId
    ? await tx.client.findUniqueOrThrow({ where: { id: input.clientId } })
    : (matchingClients[0] ??
      (await tx.client.create({
        data: {
          name: input.clientName,
          whatsapp: input.whatsapp,
          consent: !!input.whatsapp && input.consent,
        },
      })));
  const drivers = input.driverId
    ? []
    : await tx.driver.findMany({
        select: { id: true, name: true, plate: true },
      });
  const matchedDriver = findMatchingDriver(
    drivers,
    input.driverName,
    input.truckPlate,
  );
  if (!matchedDriver && driverCandidates(drivers, input.driverName).length)
    throw new ImportConflict(
      "Nome de motorista ambíguo. Selecione o cadastro correto.",
    );
  const driver = input.driverId
    ? await tx.driver.findUniqueOrThrow({ where: { id: input.driverId } })
    : (matchedDriver ??
      (await tx.driver.create({
        data: {
          name: input.driverName,
          phone: "",
          plate: normalizePlate(input.truckPlate),
        },
      })));
  const truckPlate = normalizePlate(input.truckPlate);
  const trailerPlate = normalizePlate(input.trailerPlate);
  const vehicle = (plate: string) =>
    tx.vehicle.upsert({ where: { plate }, create: { plate }, update: {} });
  const truck = await vehicle(truckPlate);
  const trailer = trailerPlate ? await vehicle(trailerPlate) : null;
  return {
    clientId: client.id,
    driverId: driver.id,
    truckVehicleId: truck.id,
    trailerVehicleId: trailer?.id ?? null,
    truckPlate,
    trailerPlate,
  };
}
