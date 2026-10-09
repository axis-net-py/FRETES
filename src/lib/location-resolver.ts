// Resolver de geolocalização e nomes de cidades para o corredor logístico AXIS
// Converte coordenadas GPS (latitude, longitude) no nome da cidade e ponto de referência
// ex: "Palmeira, PR (4.7 km)", "em Aduana Paraguaya, Ciudad del Este, PY", "em Manu Logística (Pátio AXIS), Katueté, PY"

export type ResolvedLocation = {
  cityName: string;
  state: string;
  country: string;
  locationLabel: string;
  shortLabel: string;
  isAtCompanyYard: boolean;
  isAtAduana: boolean;
  isAtPort: boolean;
};

// Hubs logísticos específicos do corredor AXIS
export const LOGISTICS_HUBS = [
  {
    id: "patio-katuete",
    name: "Manu Logística (Sede Katueté)",
    city: "Katueté",
    state: "Canindeyú",
    country: "PY",
    latitude: -24.2567,
    longitude: -54.772,
    radiusM: 2500,
    type: "YARD" as const,
  },
  {
    id: "aduana-cde",
    name: "Aduana Paraguaya",
    city: "Ciudad del Este",
    state: "Alto Paraná",
    country: "PY",
    latitude: -25.5115,
    longitude: -54.603,
    radiusM: 3000,
    type: "ADUANA" as const,
  },
  {
    id: "aduana-foz",
    name: "Aduana Brasileira",
    city: "Foz do Iguaçu",
    state: "PR",
    country: "BR",
    latitude: -25.513,
    longitude: -54.59,
    radiusM: 2000,
    type: "ADUANA" as const,
  },
  {
    id: "porto-paranagua",
    name: "Porto de Paranaguá",
    city: "Paranaguá",
    state: "PR",
    country: "BR",
    latitude: -25.5015,
    longitude: -48.5035,
    radiusM: 3500,
    type: "PORT" as const,
  },
  {
    id: "porto-santos",
    name: "Porto de Santos",
    city: "Santos",
    state: "SP",
    country: "BR",
    latitude: -23.94215,
    longitude: -46.31056,
    radiusM: 3500,
    type: "PORT" as const,
  },
  {
    id: "multilog-sjp",
    name: "Multilog",
    city: "São José dos Pinhais",
    state: "PR",
    country: "BR",
    latitude: -25.534,
    longitude: -49.195,
    radiusM: 2000,
    type: "DRY_PORT" as const,
  },
];

// Cidades e municípios ao longo do trajeto (Paraguai e Paraná / BR-277)
export const LOGISTICS_CITIES = [
  // PARAGUAY - Canindeyú, Alto Paraná, Itapúa, Central
  { name: "Katueté", state: "Canindeyú", country: "PY", latitude: -24.2567, longitude: -54.772 },
  { name: "La Paloma del Espíritu Santo", state: "Canindeyú", country: "PY", latitude: -24.1667, longitude: -54.6 },
  { name: "Salto del Guairá", state: "Canindeyú", country: "PY", latitude: -24.0625, longitude: -54.3069 },
  { name: "San Alberto", state: "Alto Paraná", country: "PY", latitude: -24.9833, longitude: -54.9167 },
  { name: "Minga Porã", state: "Alto Paraná", country: "PY", latitude: -24.8667, longitude: -54.9167 },
  { name: "Hernandarias", state: "Alto Paraná", country: "PY", latitude: -25.4078, longitude: -54.6369 },
  { name: "Ciudad del Este", state: "Alto Paraná", country: "PY", latitude: -25.51, longitude: -54.6111 },
  { name: "Presidente Franco", state: "Alto Paraná", country: "PY", latitude: -25.5383, longitude: -54.615 },
  { name: "Minga Guazú", state: "Alto Paraná", country: "PY", latitude: -25.4853, longitude: -54.7617 },
  { name: "Santa Rita", state: "Alto Paraná", country: "PY", latitude: -25.7867, longitude: -55.0867 },
  { name: "Santa Rosa del Monday", state: "Alto Paraná", country: "PY", latitude: -25.8667, longitude: -55.0167 },
  { name: "Naranjal", state: "Alto Paraná", country: "PY", latitude: -25.9667, longitude: -55.1833 },
  { name: "Colonia Tirol", state: "Itapúa", country: "PY", latitude: -26.4, longitude: -54.75 },
  { name: "Encarnación", state: "Itapúa", country: "PY", latitude: -27.3306, longitude: -55.8667 },
  { name: "Asunción", state: "Central", country: "PY", latitude: -25.2867, longitude: -57.647 },

  // BRASIL - Paraná (Corredor BR-277 / Curitiba / Oeste / Noroeste)
  { name: "Guaíra", state: "PR", country: "BR", latitude: -24.0811, longitude: -54.2567 },
  { name: "Terra Roxa", state: "PR", country: "BR", latitude: -24.16, longitude: -54.0983 },
  { name: "Palotina", state: "PR", country: "BR", latitude: -24.2833, longitude: -53.84 },
  { name: "Mercedes", state: "PR", country: "BR", latitude: -24.455, longitude: -54.1611 },
  { name: "Marechal Cândido Rondon", state: "PR", country: "BR", latitude: -24.5564, longitude: -54.0569 },
  { name: "Toledo", state: "PR", country: "BR", latitude: -24.7256, longitude: -53.7431 },
  { name: "Cascavel", state: "PR", country: "BR", latitude: -24.9578, longitude: -53.4594 },
  { name: "Santa Tereza do Oeste", state: "PR", country: "BR", latitude: -25.0531, longitude: -53.63 },
  { name: "Céu Azul", state: "PR", country: "BR", latitude: -25.1436, longitude: -53.8475 },
  { name: "Matelândia", state: "PR", country: "BR", latitude: -25.2417, longitude: -53.9961 },
  { name: "Medianeira", state: "PR", country: "BR", latitude: -25.2972, longitude: -54.0939 },
  { name: "São Miguel do Iguaçu", state: "PR", country: "BR", latitude: -25.3481, longitude: -54.2417 },
  { name: "Santa Terezinha de Itaipu", state: "PR", country: "BR", latitude: -25.4389, longitude: -54.4019 },
  { name: "Foz do Iguaçu", state: "PR", country: "BR", latitude: -25.5478, longitude: -54.5881 },
  { name: "Campo Bonito", state: "PR", country: "BR", latitude: -25.0278, longitude: -52.9917 },
  { name: "Ibema", state: "PR", country: "BR", latitude: -25.1278, longitude: -53.0111 },
  { name: "Guaraniaçu", state: "PR", country: "BR", latitude: -25.1011, longitude: -52.8778 },
  { name: "Nova Laranjeiras", state: "PR", country: "BR", latitude: -25.3056, longitude: -52.5408 },
  { name: "Laranjeiras do Sul", state: "PR", country: "BR", latitude: -25.4078, longitude: -52.4161 },
  { name: "Virmond", state: "PR", country: "BR", latitude: -25.3833, longitude: -52.2 },
  { name: "Cantagalo", state: "PR", country: "BR", latitude: -25.3744, longitude: -52.1228 },
  { name: "Candói", state: "PR", country: "BR", latitude: -25.5786, longitude: -52.0469 },
  { name: "Guarapuava", state: "PR", country: "BR", latitude: -25.3906, longitude: -51.4628 },
  { name: "Prudentópolis", state: "PR", country: "BR", latitude: -25.2133, longitude: -50.9781 },
  { name: "Imbituva", state: "PR", country: "BR", latitude: -25.23, longitude: -50.6 },
  { name: "Irati", state: "PR", country: "BR", latitude: -25.4675, longitude: -50.6511 },
  { name: "Fernandes Pinheiro", state: "PR", country: "BR", latitude: -25.4167, longitude: -50.55 },
  { name: "Teixeira Soares", state: "PR", country: "BR", latitude: -25.3683, longitude: -50.4617 },
  { name: "Ponta Grossa", state: "PR", country: "BR", latitude: -25.0994, longitude: -50.1583 },
  { name: "Palmeira", state: "PR", country: "BR", latitude: -25.438, longitude: -49.845 },
  { name: "Porto Amazonas", state: "PR", country: "BR", latitude: -25.5447, longitude: -49.8911 },
  { name: "Balsa Nova", state: "PR", country: "BR", latitude: -25.5847, longitude: -49.6358 },
  { name: "Campo Largo", state: "PR", country: "BR", latitude: -25.4597, longitude: -49.5275 },
  { name: "Curitiba", state: "PR", country: "BR", latitude: -25.4284, longitude: -49.2733 },
  { name: "São José dos Pinhais", state: "PR", country: "BR", latitude: -25.5347, longitude: -49.2064 },
  { name: "Morretes", state: "PR", country: "BR", latitude: -25.4747, longitude: -48.8344 },
  { name: "Paranaguá", state: "PR", country: "BR", latitude: -25.5205, longitude: -48.5092 },

  // NORTE / NOROESTE DO PARANÁ
  { name: "Maringá", state: "PR", country: "BR", latitude: -23.4208, longitude: -51.9331 },
  { name: "Doutor Camargo", state: "PR", country: "BR", latitude: -23.5558, longitude: -52.2197 },
  { name: "Campo Mourão", state: "PR", country: "BR", latitude: -24.0456, longitude: -52.3789 },
  { name: "Umuarama", state: "PR", country: "BR", latitude: -23.7661, longitude: -53.325 },
  { name: "Londrina", state: "PR", country: "BR", latitude: -23.3103, longitude: -51.1628 },

  // SÃO PAULO (Corredor Porto de Santos / Baixada Santista e BR-116 Régis Bittencourt)
  { name: "Santos", state: "SP", country: "BR", latitude: -23.9608, longitude: -46.3336 },
  { name: "Cubatão", state: "SP", country: "BR", latitude: -23.8953, longitude: -46.4253 },
  { name: "São Vicente", state: "SP", country: "BR", latitude: -23.9631, longitude: -46.3919 },
  { name: "Praia Grande", state: "SP", country: "BR", latitude: -24.0058, longitude: -46.4028 },
  { name: "Guarujá", state: "SP", country: "BR", latitude: -23.9931, longitude: -46.2564 },
  { name: "São Paulo", state: "SP", country: "BR", latitude: -23.5505, longitude: -46.6333 },
  { name: "São Bernardo do Campo", state: "SP", country: "BR", latitude: -23.6944, longitude: -46.5653 },
  { name: "Juquitiba", state: "SP", country: "BR", latitude: -23.9317, longitude: -47.0706 },
  { name: "Miracatu", state: "SP", country: "BR", latitude: -24.2819, longitude: -47.4597 },
  { name: "Registro", state: "SP", country: "BR", latitude: -24.4881, longitude: -47.8436 },
  { name: "Cajati", state: "SP", country: "BR", latitude: -24.7364, longitude: -48.1228 },
  { name: "Barra do Turvo", state: "SP", country: "BR", latitude: -24.7578, longitude: -48.5042 },

  // MATO GROSSO DO SUL
  { name: "Mundo Novo", state: "MS", country: "BR", latitude: -23.9422, longitude: -54.2711 },
  { name: "Eldorado", state: "MS", country: "BR", latitude: -23.7869, longitude: -54.2839 },
  { name: "Naviraí", state: "MS", country: "BR", latitude: -23.0644, longitude: -54.1906 },
];

export function haversineDistanceM(
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

export function resolveLocation({
  latitude,
  longitude,
}: {
  latitude: number;
  longitude: number;
}): ResolvedLocation {
  // 1. Verificar se está dentro do raio de algum hub logístico específico
  for (const hub of LOGISTICS_HUBS) {
    const dist = haversineDistanceM(
      latitude,
      longitude,
      hub.latitude,
      hub.longitude,
    );
    if (dist <= hub.radiusM) {
      const isAtCompanyYard = hub.type === "YARD";
      const isAtAduana = hub.type === "ADUANA";
      const isAtPort = hub.type === "PORT";

      let prefix = "em ";
      if (isAtPort) prefix = "no ";
      else if (hub.type === "DRY_PORT") prefix = "na ";

      return {
        cityName: hub.city,
        state: hub.state,
        country: hub.country,
        locationLabel: `${prefix}${hub.name}, ${hub.city}, ${hub.country}`,
        shortLabel: `${hub.name} (${hub.city})`,
        isAtCompanyYard,
        isAtAduana,
        isAtPort,
      };
    }
  }

  // 2. Encontrar a cidade mais próxima
  let closestCity = LOGISTICS_CITIES[0];
  let minDistanceM = Infinity;

  for (const city of LOGISTICS_CITIES) {
    const dist = haversineDistanceM(
      latitude,
      longitude,
      city.latitude,
      city.longitude,
    );
    if (dist < minDistanceM) {
      minDistanceM = dist;
      closestCity = city;
    }
  }

  const distKm = minDistanceM / 1000;

  // Se estiver a menos de 2.5 km do centro da cidade, mostrar a cidade diretamente
  if (distKm <= 2.5) {
    return {
      cityName: closestCity.name,
      state: closestCity.state,
      country: closestCity.country,
      locationLabel: `${closestCity.name}, ${closestCity.state}, ${closestCity.country}`,
      shortLabel: `${closestCity.name}, ${closestCity.state}`,
      isAtCompanyYard: false,
      isAtAduana: false,
      isAtPort: false,
    };
  }

  // Se estiver na rodovia / afastado, mostrar a distância até a cidade de referência
  const distFormatted = distKm < 10 ? distKm.toFixed(2) : distKm.toFixed(1);
  return {
    cityName: closestCity.name,
    state: closestCity.state,
    country: closestCity.country,
    locationLabel: `${distFormatted} km de ${closestCity.name}, ${closestCity.state}, ${closestCity.country}`,
    shortLabel: `${distFormatted} km de ${closestCity.name}, ${closestCity.state}`,
    isAtCompanyYard: false,
    isAtAduana: false,
    isAtPort: false,
  };
}
