export const CONTAINER_STATUSES = [
  "EM_TRANSITO",
  "CHEGADA_PORTAO",
  "LIBERADO",
  "CARREGADO",
  "ENTREGUE",
] as const;

export type ContainerStatus = (typeof CONTAINER_STATUSES)[number];

export const STATUS_LABELS: Record<ContainerStatus, string> = {
  EM_TRANSITO: "Em trânsito",
  CHEGADA_PORTAO: "Chegou ao portão de liberação",
  LIBERADO: "Liberado no porto",
  CARREGADO: "Carregado",
  ENTREGUE: "Entregue",
};

export function isContainerStatus(value: string): value is ContainerStatus {
  return (CONTAINER_STATUSES as readonly string[]).includes(value);
}
