export type GpsHealth = "ONLINE" | "ATTENTION" | "OFFLINE";

export type TruckOperationalStatus =
  | "EM_VIAGEM"
  | "NO_PORTO"
  | "DISPONIVEL"
  | "SEM_FRETE";

export type GpsHealthInfo = {
  health: GpsHealth;
  ageMinutes: number;
  healthLabel: string;
};

export type RawPositionFix = {
  id: string;
  driverId: string;
  containerId?: string | null;
  latitude: number;
  longitude: number;
  recordedAt: Date | string;
  source: string;
  driverPlate?: string | null;
};

export type FleetFreight = {
  id: string;
  code: string;
  status: string;
  origin: string | null;
  destination: string | null;
  trailerPlate: string | null;
  crt: string | null;
  micDta: string | null;
  departedAt: string | null;
  updatedAt: string;
  driverName?: string | null;
  clientName?: string | null;
  document: { id: string; filename: string } | null;
};

export type FleetVehicle = {
  id: string;
  plate: string;
  driver: {
    id: string;
    name: string;
    phone: string;
  } | null;
  status: TruckOperationalStatus;
  statusLabel: string;
  activeFreight: FleetFreight | null;
  lastPosition: {
    latitude: number;
    longitude: number;
    recordedAt: string;
    source: string;
    health: GpsHealth;
    ageMinutes: number;
    healthLabel: string;
    isAtCompanyYard?: boolean;
    locationLabel?: string;
  } | null;
  tripHistory: FleetFreight[];
  totalTripsCompleted: number;
};

export function normalizePlate(value: string) {
  return (value || "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}

export function computeGpsHealth(
  recordedAt: Date | string | null | undefined,
  now = new Date(),
): GpsHealthInfo {
  if (!recordedAt) {
    return {
      health: "OFFLINE",
      ageMinutes: Infinity,
      healthLabel: "Sem sinal de GPS",
    };
  }

  const date = recordedAt instanceof Date ? recordedAt : new Date(recordedAt);
  if (isNaN(date.getTime())) {
    return {
      health: "OFFLINE",
      ageMinutes: Infinity,
      healthLabel: "Sem sinal de GPS",
    };
  }

  const diffMs = now.getTime() - date.getTime();
  const ageMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (ageMinutes < 30) {
    return {
      health: "ONLINE",
      ageMinutes,
      healthLabel: ageMinutes < 1 ? "Sinal agora" : `Sinal há ${ageMinutes}m`,
    };
  }

  if (ageMinutes < 120) {
    return {
      health: "ATTENTION",
      ageMinutes,
      healthLabel: `Atenção: há ${ageMinutes}m`,
    };
  }

  const hours = Math.floor(ageMinutes / 60);
  return {
    health: "OFFLINE",
    ageMinutes,
    healthLabel: hours < 24 ? `Sem sinal há ${hours}h` : "Sem sinal recente",
  };
}

export function deriveTruckStatus(
  activeContainer?: { status: string } | null,
): { status: TruckOperationalStatus; statusLabel: string } {
  if (!activeContainer) {
    return { status: "DISPONIVEL", statusLabel: "Disponível" };
  }

  const s = activeContainer.status;
  if (["EM_TRANSITO", "A_CAMINHO_DESTINO"].includes(s)) {
    return { status: "EM_VIAGEM", statusLabel: "Em Viagem" };
  }
  if (["CHEGADA_PORTAO", "LIBERADO"].includes(s)) {
    return { status: "NO_PORTO", statusLabel: "No Porto / Aduana" };
  }
  if (s === "ENTREGUE") {
    return { status: "DISPONIVEL", statusLabel: "Disponível" };
  }

  return { status: "EM_VIAGEM", statusLabel: s };
}

export type DriverEntity = {
  id: string;
  name: string;
  phone?: string | null;
  plate?: string | null;
};

export type ContainerEntity = {
  id: string;
  code: string;
  status: string;
  origin?: string | null;
  destination?: string | null;
  truckPlate?: string | null;
  trailerPlate?: string | null;
  crt?: string | null;
  micDta?: string | null;
  departedAt?: Date | string | null;
  updatedAt: Date | string;
  driverId?: string | null;
  client?: { name: string } | null;
  driver?: { id: string; name: string; phone?: string | null } | null;
  documentLinks?: Array<{
    document: { id: string; filename: string };
  }>;
};

export const AXIS_FLEET_PLATES = [
  "AAME593",
  "AAME814",
  "AAME899",
  "AARG542",
  "AARG801",
  "AASC676",
  "AASZ042",
  "AAUT382",
  "AAYE568",
  "ABBJ596",
  "ABCD519",
] as const;

export const COMPANY_YARD = {
  latitude: -24.2567,
  longitude: -54.772,
  name: "Pátio da empresa (Katueté)",
};

function distanceM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function aggregateFleet({
  containers,
  drivers,
  latestPositions,
  now = new Date(),
}: {
  containers: ContainerEntity[];
  drivers: DriverEntity[];
  latestPositions: RawPositionFix[];
  now?: Date;
}): FleetVehicle[] {
  // Map drivers by normalized plate and ID
  const driverByPlate = new Map<string, DriverEntity>();
  const driverById = new Map<string, DriverEntity>();
  for (const d of drivers) {
    driverById.set(d.id, d);
    if (d.plate) {
      driverByPlate.set(normalizePlate(d.plate), d);
    }
  }

  // 1. Identify positions from GlobalSAT
  const positionByPlate = new Map<string, RawPositionFix>();
  for (const pos of latestPositions) {
    if (pos.source === "GLOBALSAT") {
      let plate = pos.driverPlate ? normalizePlate(pos.driverPlate) : "";
      if (!plate && pos.driverId && driverById.has(pos.driverId)) {
        const found = driverById.get(pos.driverId);
        plate = found?.plate ? normalizePlate(found.plate) : "";
      }
      if (plate && !positionByPlate.has(plate)) {
        positionByPlate.set(plate, pos);
      }
    }
  }

  // 2. Identify the fleet:
  // The AXIS fleet has 11 registered trucks (AXIS_FLEET_PLATES).
  // Include every driver who belongs to the AXIS fleet or has a GlobalSAT position.
  const fleetPlates = new Set<string>();

  for (const d of drivers) {
    const p = normalizePlate(d.plate || "");
    if (!p) continue;
    if (
      (AXIS_FLEET_PLATES as readonly string[]).includes(p) ||
      positionByPlate.has(p)
    ) {
      fleetPlates.add(p);
    }
  }

  // In production (when all company drivers are loaded), ensure all 11 canonical plates exist
  if (drivers.length >= 6) {
    for (const p of AXIS_FLEET_PLATES) {
      fleetPlates.add(p);
    }
  }

  // Also include any plate that has a GlobalSAT position
  for (const [plate] of positionByPlate) {
    if ((AXIS_FLEET_PLATES as readonly string[]).includes(plate)) {
      fleetPlates.add(plate);
    }
  }

  // Map containers by truck plate
  const containersByTruckPlate = new Map<string, ContainerEntity[]>();
  for (const c of containers) {
    const p = normalizePlate(c.truckPlate || "");
    if (p) {
      const list = containersByTruckPlate.get(p) || [];
      list.push(c);
      containersByTruckPlate.set(p, list);
    }
  }

  // Build FleetVehicle for each fleet plate
  const fleet: FleetVehicle[] = [];

  for (const plate of fleetPlates) {
    const rawDriver = driverByPlate.get(plate);
    const truckContainers = containersByTruckPlate.get(plate) || [];

    // Separate active freight vs history
    // An active freight is one where status != "ENTREGUE"
    const activeRaw = truckContainers.find((c) => c.status !== "ENTREGUE") || null;
    const historyRaw = truckContainers.filter((c) => c.status === "ENTREGUE");

    // Helper to format freight
    const formatFreight = (c: ContainerEntity): FleetFreight => ({
      id: c.id,
      code: c.code,
      status: c.status,
      origin: c.origin || null,
      destination: c.destination || null,
      trailerPlate: c.trailerPlate || null,
      crt: c.crt || null,
      micDta: c.micDta || null,
      departedAt: c.departedAt ? String(c.departedAt) : null,
      updatedAt: String(c.updatedAt),
      driverName: c.driver?.name || rawDriver?.name || null,
      clientName: c.client?.name || null,
      document:
        c.documentLinks && c.documentLinks.length > 0 && c.documentLinks[0].document
          ? {
              id: c.documentLinks[0].document.id,
              filename: c.documentLinks[0].document.filename,
            }
          : null,
    });

    const activeFreight = activeRaw ? formatFreight(activeRaw) : null;
    const tripHistory = historyRaw.map(formatFreight).sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );

    const { status, statusLabel } = deriveTruckStatus(activeFreight);

    // Position & GPS Health
    const pos = positionByPlate.get(plate);
    let lastPosition: FleetVehicle["lastPosition"] = null;
    if (pos) {
      const recordedAt =
        pos.recordedAt instanceof Date
          ? pos.recordedAt.toISOString()
          : String(pos.recordedAt);
      const healthInfo = computeGpsHealth(pos.recordedAt, now);
      const distToYard = distanceM(
        pos.latitude,
        pos.longitude,
        COMPANY_YARD.latitude,
        COMPANY_YARD.longitude,
      );
      const isAtCompanyYard = distToYard <= 2500;
      let healthLabel = healthInfo.healthLabel;
      if (isAtCompanyYard && status === "DISPONIVEL") {
        healthLabel = "No pátio (estacionado)";
      }
      lastPosition = {
        latitude: pos.latitude,
        longitude: pos.longitude,
        recordedAt,
        source: pos.source,
        ...healthInfo,
        healthLabel,
        isAtCompanyYard,
        locationLabel: isAtCompanyYard ? COMPANY_YARD.name : undefined,
      };
    }

    const driverObj = rawDriver
      ? {
          id: rawDriver.id,
          name: rawDriver.name,
          phone: rawDriver.phone || "",
        }
      : activeRaw?.driver
        ? {
            id: activeRaw.driver.id,
            name: activeRaw.driver.name,
            phone: activeRaw.driver.phone || "",
          }
        : null;

    fleet.push({
      id: `vehicle-${plate}`,
      plate,
      driver: driverObj,
      status,
      statusLabel,
      activeFreight,
      lastPosition,
      tripHistory,
      totalTripsCompleted: tripHistory.length,
    });
  }

  // Sort: Em Viagem first, then No Porto, then Disponivel, then by plate
  const statusOrder: Record<TruckOperationalStatus, number> = {
    EM_VIAGEM: 1,
    NO_PORTO: 2,
    DISPONIVEL: 3,
    SEM_FRETE: 4,
  };

  return fleet.sort((a, b) => {
    const orderA = statusOrder[a.status] || 99;
    const orderB = statusOrder[b.status] || 99;
    if (orderA !== orderB) return orderA - orderB;
    return a.plate.localeCompare(b.plate);
  });
}
