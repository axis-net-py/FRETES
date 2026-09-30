export const CONTAINER_STATUSES = [
  "EM_TRANSITO",
  "CHEGADA_PORTAO",
  "LIBERADO",
  "CARREGADO",
  "A_CAMINHO_DESTINO",
  "ENTREGUE",
  "CHEGADA_MULTILOG",
  "CHEGADA_ADUANA",
  "SAIDA_ADUANA",
  "CHEGADA_APPA",
] as const;

export type ContainerStatus = (typeof CONTAINER_STATUSES)[number];

export const STATUS_LABELS: Record<ContainerStatus, string> = {
  EM_TRANSITO: "A caminho do porto",
  CHEGADA_PORTAO: "No portão · aguardando liberação",
  A_CAMINHO_DESTINO: "A caminho do destino",
  LIBERADO: "Liberado no porto",
  CARREGADO: "Carregado",
  ENTREGUE: "Entregue",
  CHEGADA_MULTILOG: "Chegou à Multilog",
  CHEGADA_ADUANA: "Chegou à aduana paraguaia",
  SAIDA_ADUANA: "Saiu da aduana paraguaia",
  CHEGADA_APPA: "Chegou ao porto APPA",
};

export function isContainerStatus(value: string): value is ContainerStatus {
  return (CONTAINER_STATUSES as readonly string[]).includes(value);
}
