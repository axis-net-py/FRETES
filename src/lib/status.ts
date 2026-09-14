export const CONTAINER_STATUSES = [
  "EM_TRANSITO",
  "CHEGADA_PORTAO",
  "LIBERADO",
  "CARREGADO",
  "A_CAMINHO_DESTINO",
  "ENTREGUE",
] as const;

export type ContainerStatus = (typeof CONTAINER_STATUSES)[number];

export const STATUS_LABELS: Record<ContainerStatus, string> = {
  EM_TRANSITO: "A caminho do porto",
  CHEGADA_PORTAO: "No portão · aguardando liberação",
  A_CAMINHO_DESTINO: "A caminho do destino",
  LIBERADO: "Liberado no porto",
  CARREGADO: "Carregado",
  ENTREGUE: "Entregue",
};

export function isContainerStatus(value: string): value is ContainerStatus {
  return (CONTAINER_STATUSES as readonly string[]).includes(value);
}
