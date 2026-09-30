export type JourneyGate = {
  id: string;
  kind: string;
  notifyOnEnter: boolean;
  notifyOnExit: boolean;
};

export type JourneyEvent = {
  geofenceId: string;
  type: string;
};

export function gateCompleted(
  gate: JourneyGate,
  events: JourneyEvent[],
): boolean {
  const hasEnter = events.some(
    (event) => event.geofenceId === gate.id && event.type === "ENTER",
  );
  const hasExit = events.some(
    (event) => event.geofenceId === gate.id && event.type === "EXIT",
  );
  return gate.notifyOnExit ? hasExit : hasEnter;
}

// The journey is every active gate in creation order; the target is the
// first incomplete one. Out-of-order arrivals still record, but the
// engine only evaluates the target, so overlapping zones never collide.
export function journeyTarget<T extends JourneyGate>(
  gates: T[],
  events: JourneyEvent[],
): T | null {
  return gates.find((gate) => !gateCompleted(gate, events)) || null;
}

export function notificationKindFor(
  gateKind: string,
  event: "ENTER" | "EXIT",
): string {
  if (gateKind === "PORT_EXIT" && event === "EXIT") return "DEPARTURE";
  if (gateKind === "MULTILOG" && event === "ENTER") return "MULTILOG_ARRIVAL";
  if (gateKind === "CUSTOMS_ENTRY" && event === "ENTER") return "CUSTOMS_ENTRY";
  if (gateKind === "CUSTOMS_EXIT" && event === "EXIT") return "CUSTOMS_EXIT";
  if (gateKind === "DESTINATION" && event === "ENTER") return "DESTINATION_ARRIVAL";
  if (gateKind === "DESTINATION" && event === "EXIT") return "DESTINATION_DEPARTURE";
  return `${gateKind}_${event}`;
}

export type EventMessage = {
  eventText: string;
  subject: string;
  headline: string;
};

export function eventMessage(kind: string, crew: string): EventMessage {
  const withCrew = (base: string) =>
    crew ? `${base} com ${crew}` : base;
  switch (kind) {
    case "DEPARTURE":
      return {
        eventText: `${withCrew("saiu do Porto de Paranaguá")} e iniciou o trajeto`,
        subject: "Saída do porto",
        headline: "Saída do porto confirmada pelo rastreamento.",
      };
    case "MULTILOG_ARRIVAL":
      return {
        eventText: withCrew("chegou à Multilog"),
        subject: "Chegada à Multilog",
        headline: "Chegada à Multilog confirmada pelo rastreamento.",
      };
    case "CUSTOMS_ENTRY":
      return {
        eventText: withCrew("entrou na aduana paraguaia"),
        subject: "Entrada na aduana",
        headline: "Entrada na aduana paraguaia confirmada pelo rastreamento.",
      };
    case "CUSTOMS_EXIT":
      return {
        eventText: `${withCrew("foi liberado da aduana paraguaia")} e seguiu viagem`,
        subject: "Saída da aduana",
        headline: "Saída da aduana paraguaia confirmada pelo rastreamento.",
      };
    case "DESTINATION_ARRIVAL":
      return {
        eventText: withCrew("chegou à cidade de destino"),
        subject: "Chegada ao destino",
        headline: "Chegada ao destino confirmada pelo rastreamento.",
      };
    case "DESTINATION_DEPARTURE":
      return {
        eventText: withCrew("saiu da cidade de destino"),
        subject: "Saída do destino",
        headline: "Saída do destino confirmada - frete concluído.",
      };
    default:
      return {
        eventText: withCrew("registrou movimentação"),
        subject: "Atualização do frete",
        headline: "Movimentação confirmada pelo rastreamento.",
      };
  }
}
