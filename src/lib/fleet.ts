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
  // 1. Identify which plates have GlobalSAT tracking:
  // The user requested: only include trucks that count with GlobalSAT synchronization.
  const globalSatPlates = new Set<string>();
  const positionByPlate = new Map<string, RawPositionFix>();

  // Map drivers by normalized plate
  const driverByPlate = new Map<string, DriverEntity>();
  const driverById = new Map<string, DriverEntity>();
  for (const d of drivers) {
    driverById.set(d.id, d);
    if (d.plate) {
      driverByPlate.set(normalizePlate(d.plate), d);
    }
  }

  for (const pos of latestPositions) {
    if (pos.source === "GLOBALSAT") {
      let plate = pos.driverPlate ? normalizePlate(pos.driverPlate) : "";
      if (!plate && pos.driverId && driverById.has(pos.driverId)) {
        const found = driverById.get(pos.driverId);
        plate = found?.plate ? normalizePlate(found.plate) : "";
      }
      if (plate) {
        globalSatPlates.add(plate);
        if (!positionByPlate.has(plate)) {
          positionByPlate.set(plate, pos);
        }
      }
    }
  }

  // Also include any truck that has an active container or driver matching a GlobalSat plate
  const containersByTruckPlate = new Map<string, ContainerEntity[]>();
  for (const c of containers) {
    const p = normalizePlate(c.truckPlate || "");
    if (p) {
      const list = containersByTruckPlate.get(p) || [];
      list.push(c);
      containersByTruckPlate.set(p, list);
    }
  }

  // Build FleetVehicle for each GlobalSat plate
  const fleet: FleetVehicle[] = [];

  for (const plate of globalSatPlates) {
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
      lastPosition = {
        latitude: pos.latitude,
        longitude: pos.longitude,
        recordedAt,
        source: pos.source,
        ...healthInfo,
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
