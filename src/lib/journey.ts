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

// The port of Paranaguá is split in two: TPC (PORT_EXIT) handles
// containers, APPA handles loose cargo (machinery, vehicles, etc.).
// The freight document decides which port gate applies: a valid
// container code (4 letters + 7 digits) targets TPC, anything else
// targets APPA. The remaining gates are shared by both flows.
export function isContainerCode(code: string | null | undefined): boolean {
  return /^[A-Z]{4}[0-9]{7}$/.test((code || "").trim().toUpperCase());
}

export function portGateKindFor(code: string | null | undefined): string {
  return isContainerCode(code) ? "PORT_EXIT" : "APPA";
}

// The journey is every active gate in creation order; the target is the
// first incomplete one. Out-of-order arrivals still record, but the
// engine only evaluates the target, so overlapping zones never collide.
// When both port gates exist, the irrelevant one for this cargo is
// skipped; with a single port gate it always applies (legacy setups).
export function journeyTarget<T extends JourneyGate>(
  gates: T[],
  events: JourneyEvent[],
  code?: string | null,
): T | null {
  const wanted = portGateKindFor(code);
  const portGates = gates.filter(
    (gate) => gate.kind === "PORT_EXIT" || gate.kind === "APPA",
  );
  const nonPortGates = gates.filter(
    (gate) => gate.kind !== "PORT_EXIT" && gate.kind !== "APPA",
  );
  const prioritizedPort =
    portGates.find((g) => g.kind === wanted) || portGates[0];
  const ordered = [
    ...(prioritizedPort ? [prioritizedPort] : []),
    ...nonPortGates,
  ];
  return ordered.find((gate) => !gateCompleted(gate, events)) || null;
}

export function notificationKindFor(
  gateKind: string,
  event: "ENTER" | "EXIT",
): string {
  if ((gateKind === "PORT_EXIT" || gateKind === "APPA") && event === "EXIT")
    return "DEPARTURE";
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

// Event texts always carry the GPS event date ("acaba de" would lie when
// a notification goes out late, e.g. after a sync backlog catch-up).
export function formatEventAt(at?: Date): string {
  if (!at || Number.isNaN(at.getTime())) return "";
  const date = at.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
  const time = at.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  return ` em ${date} às ${time}`;
}

export function eventMessage(kind: string, at?: Date): EventMessage {
  const when = formatEventAt(at);
  switch (kind) {
    case "DEPARTURE":
      return {
        eventText: `saiu do Porto de Paranaguá e iniciou o trajeto${when}`,
        subject: "Saída do porto",
        headline: "Saída do porto confirmada pelo rastreamento.",
      };
    case "MULTILOG_ARRIVAL":
      return {
        eventText: `chegou à Multilog${when}`,
        subject: "Chegada à Multilog",
        headline: "Chegada à Multilog confirmada pelo rastreamento.",
      };
    case "CUSTOMS_ENTRY":
      return {
        eventText: `entrou na aduana paraguaia${when}`,
        subject: "Entrada na aduana",
        headline: "Entrada na aduana paraguaia confirmada pelo rastreamento.",
      };
    case "CUSTOMS_EXIT":
      return {
        eventText: `foi liberado da aduana paraguaia e seguiu viagem${when}`,
        subject: "Saída da aduana",
        headline: "Saída da aduana paraguaia confirmada pelo rastreamento.",
      };
    case "DESTINATION_ARRIVAL":
      return {
        eventText: `chegou à cidade de destino${when}`,
        subject: "Chegada ao destino",
        headline: "Chegada ao destino confirmada pelo rastreamento.",
      };
    case "DESTINATION_DEPARTURE":
      return {
        eventText: `saiu da cidade de destino${when}`,
        subject: "Saída do destino",
        headline: "Saída do destino confirmada - frete concluído.",
      };
    default:
      return {
        eventText: "registrou movimentação",
        subject: "Atualização do frete",
        headline: "Movimentação confirmada pelo rastreamento.",
      };
  }
}

// A carga [tal] [atualização com data], do motorista [tal] com caminhão
// [tal] em direção do cliente [tal] com destino [tal], com previsão [tal].
// parts: [cargo, event, crew, clientDest, eta, link]
export function formatUpdateMessage(parts: string[]): string {
  const [cargo, event, crew, clientDest, eta, link] = parts.map(
    (part) => part || "",
  );
  let text =
    `Atualização de frete da Manu Logistica EAS: a carga ${cargo} ${event}.` +
    ` Motorista ${crew} em direção ao cliente ${clientDest}.` +
    ` Previsão de chegada: ${eta || "a confirmar"}.`;
  if (link) text += ` Acompanhe o trajeto: ${link}.`;
  return text;
}
