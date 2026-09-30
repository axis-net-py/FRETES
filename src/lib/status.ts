export const CONTAINER_STATUSES = [
  "EM_TRANSITO",
  "TPC",
  "LIBERADO",
  "CARREGADO",
  "A_CAMINHO_DESTINO",
  "ENTREGUE",
  "CHEGADA_MULTILOG",
  "ADUANA",
  "CHEGADA_APPA",
] as const;

export type ContainerStatus = (typeof CONTAINER_STATUSES)[number];

export const STATUS_LABELS: Record<ContainerStatus, string> = {
  EM_TRANSITO: "A caminho do porto",
  TPC: "TPC",
  LIBERADO: "Liberado no porto",
  CARREGADO: "Carregado",
  A_CAMINHO_DESTINO: "A caminho do cliente",
  ENTREGUE: "Entregue",
  CHEGADA_MULTILOG: "MULTILOG",
  ADUANA: "ADUANA PARAGUAIA",
  CHEGADA_APPA: "APPA",
};

export function isContainerStatus(value: string): value is ContainerStatus {
  return (CONTAINER_STATUSES as readonly string[]).includes(value);
}
