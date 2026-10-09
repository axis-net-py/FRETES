"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  CheckCircle,
  Clock,
  ClockCounterClockwise,
  Compass,
  DownloadSimple,
  FilePdf,
  Funnel,
  ListBullets,
  MapPin,
  Package,
  Plus,
  Truck,
  WhatsappLogo,
  X,
  MagnifyingGlass,
  NavigationArrow,
  PencilSimple,
  Trash,
} from "@phosphor-icons/react";
import Shell from "./shell";
import type { FleetVehicle } from "@/lib/fleet";
import FleetMapModal from "./fleet-map-modal";
import FleetHistoryDrawer from "./fleet-history-drawer";
import {
  CONTAINER_STATUSES,
  STATUS_LABELS,
  ContainerStatus,
} from "@/lib/status";
import { gateCompleted } from "@/lib/journey";
function JourneyProgress({
  freight,
  gates,
}: {
  freight: Freight;
  gates: DashboardData["gates"];
}) {
  const journey = [...gates]
    .filter((g) => g.active)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (journey.length < 2) return null;
  const events = (freight.events || []).map((e) => ({
    geofenceId: e.geofenceId,
    type: e.type,
  }));
  const current = journey.find((g) => !gateCompleted(g, events));
  return (
    <div className="mt-5">
      <h3 className="font-semibold mb-2">Roteiro da viagem</h3>
      <ol className="space-y-2">
        {journey.map((g) => {
          const done = gateCompleted(g, events);
          const isCurrent = current?.id === g.id;
          return (
            <li key={g.id} className="flex items-center gap-2 text-sm">
              <span aria-hidden="true">{done ? "✅" : isCurrent ? "📍" : "○"}</span>
              <span>
                {g.name}
                {done ? " · concluído" : isCurrent ? " · atual" : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
import type { GlobalSatDashboardState } from "@/lib/globalsat-status";
export type Freight = {
  id: string;
  code: string;
  status: string;
  origin: string;
  destination: string;
  crt?: string;
  micDta?: string;
  truckPlate?: string;
  trailerPlate?: string;
  freightValue?: string;
  freightCurrency?: string;
  seal?: string;
  cargoDescription?: string;
  transitHours?: number;
  routeDurationSeconds?: number;
  operationalMarginSeconds?: number;
  estimatedArrivalAt?: string;
  departedAt?: string;
  document?: { id: string; filename: string } | null;
  documentLinks?: { document: { id: string; filename: string } }[];
  clientId?: string;
  driverId?: string;
  geofenceId?: string;
  client: { name: string };
  driver: { name: string; plate?: string } | null;
  updatedAt: string;
  events?: { id: string; geofenceId: string; type: string; createdAt: string }[];
};
export type DashboardData = {
  fleet?: FleetVehicle[];
  containers: Freight[];
  clients: { id: string; name: string }[];
  drivers: { id: string; name: string }[];
  gates: {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    radiusM: number;
    active: boolean;
    kind: string;
    notifyOnEnter: boolean;
    notifyOnExit: boolean;
    createdAt: string;
  }[];
  notifications: {
    id: string;
    body: string;
    status: string;
    provider?: string;
    error?: string;
    createdAt: string;
    container: { code: string };
  }[];
  globalSatSync: GlobalSatDashboardState;
  whatsappReady: boolean;
};
const labels: Record<string, string> = {
  CANCELLED: "Substituída pela regra de saída",
  PENDING: "Na fila",
  UNCONFIGURED: "Configuração pendente",
  NO_CONSENT: "Sem autorização",
  SENDING: "Enviando",
  ACCEPTED: "Aceita pela Meta",
  FAILED: "Falha no envio",
  UNKNOWN: "Verificar na Meta",
  MULTILOG_ARRIVAL: "Chegada à Multilog",
  MULTILOG_DEPARTURE: "Saída da Multilog",
  CUSTOMS_ENTRY: "Entrada na aduana",
  CUSTOMS_EXIT: "Saída da aduana",
  DESTINATION_ARRIVAL: "Chegada ao destino",
  DESTINATION_DEPARTURE: "Saída do destino",
};
const date = (d: string) =>
  new Date(d).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
export function notificationLabel(n: { status: string; provider?: string }) {
  if (n.status === "ACCEPTED" && n.provider === "email")
    return "Enviado por e-mail";
  return labels[n.status] || n.status;
}
export function Badge({ status }: { status: string }) {
  return (
    <span className={`badge ${status.toLowerCase()}`}>
      <span />
      {STATUS_LABELS[status as ContainerStatus] || labels[status] || status}
    </span>
  );
}
export default function Dashboard({
  data,
  demo = false,
}: {
  data: DashboardData;
  demo?: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const messages = params.get("view") === "mensagens";
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("TODOS");
  const [selected, setSelected] = useState<Freight | null>(null);
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  const [viewMode, setViewMode] = useState<"frota" | "containers">("frota");
  const [mapTruck, setMapTruck] = useState<FleetVehicle | null>(null);
  const [allFleetMapOpen, setAllFleetMapOpen] = useState(false);
  const [historyTruck, setHistoryTruck] = useState<FleetVehicle | null>(null);
  const [fleetFilter, setFleetFilter] = useState("TODOS");
  const [fleetQuery, setFleetQuery] = useState("");

  const fleet = data.fleet || [];
  const fleetTotal = fleet.length;
  const fleetInTransit = fleet.filter((t) => t.status === "EM_VIAGEM").length;
  const fleetInCustoms = fleet.filter((t) => t.status === "NA_ADUANA").length;
  const fleetAvailable = fleet.filter((t) => t.status === "DISPONIVEL").length;

  const filteredFleet = fleet.filter((t) => {
    const matchesFilter =
      fleetFilter === "TODOS" || t.status === fleetFilter;
    const q = fleetQuery.toLowerCase().trim();
    const matchesQuery =
      !q ||
      [
        t.plate,
        t.driver?.name,
        t.activeFreight?.code,
        t.activeFreight?.trailerPlate,
        t.activeFreight?.destination,
        t.tripHistory[0]?.destination,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    return matchesFilter && matchesQuery;
  });
  useEffect(() => {
    if (demo) return;
    const timer = setInterval(() => router.refresh(), 30000);
    return () => clearInterval(timer);
  }, [demo, router]);
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    const synchronize = async () => {
      try {
        const response = await fetch("/api/integrations/globalsat/sync", {
          method: "POST",
          signal: controller.signal,
        });
        if (response.ok) router.refresh();
      } catch {
        // The sanitized server status is shown after the next refresh.
      }
    };
    void synchronize();
    const timer = setInterval(() => void synchronize(), 60000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [demo, router]);
  const rows = data.containers.filter(
    (c) =>
      (filter === "TODOS" || c.status === filter) &&
      [c.code, c.client.name, c.driver?.name, c.destination]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const total = data.containers.length,
    transit = data.containers.filter((c) =>
      ["EM_TRANSITO", "A_CAMINHO_DESTINO"].includes(c.status),
    ).length,
    gateCount = data.containers.filter(
      (c) => c.status === "CHEGADA_PORTAO",
    ).length,
    delivered = data.containers.filter((c) => c.status === "ENTREGUE").length;
  const gate = data.gates.find((g) => g.kind === "PORT_EXIT") || data.gates[0];
  async function action(url: string, method = "POST", body?: unknown) {
    setBusy(true);
    setFeedback("");
    try {
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const p = await r.json();
      if (!r.ok) throw new Error(p.error || "Não foi possível concluir.");
      router.refresh();
      return p;
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }
  function exportCsv() {
    const cell = (v: string) =>
      '"' + (/^[=+@\-\t\r]/.test(v) ? "'" + v : v).replace(/"/g, '""') + '"';
    const csv = [
      "Container;Cliente;Motorista;Status;Origem;Destino",
      ...rows.map((c) =>
        [
          c.code,
          c.client.name,
          c.driver?.name || "",
          STATUS_LABELS[c.status as ContainerStatus],
          c.origin,
          c.destination,
        ]
          .map(cell)
          .join(";"),
      ),
    ].join("\r\n");
    const u = URL.createObjectURL(
      new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = u;
    a.download = "fretes.csv";
    a.click();
    URL.revokeObjectURL(u);
  }
  return (
    <Shell demo={demo}>
      <div className="page-heading">
        <div>
          <h1>
            {messages
              ? "Mensagens"
              : viewMode === "frota"
                ? `Controle da Frota (${fleetTotal} Caminhões)`
                : "Visão Geral dos Fretes"}
          </h1>
          <p>
            {viewMode === "frota"
              ? "Posição em tempo real, status operacional e fretes por caminhão."
              : "Acompanhe cada container. Antecipe o próximo movimento."}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 w-full lg:w-auto">
          {!messages && (
            <div className="grid grid-cols-2 sm:flex items-center bg-slate-200/80 p-1 rounded-xl">
              <button
                onClick={() => setViewMode("frota")}
                className={`py-2 sm:py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                  viewMode === "frota"
                    ? "bg-slate-900 text-yellow-400 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Truck size={16} weight={viewMode === "frota" ? "fill" : "regular"} />
                Frota ({fleetTotal})
              </button>
              <button
                onClick={() => setViewMode("containers")}
                className={`py-2 sm:py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                  viewMode === "containers"
                    ? "bg-slate-900 text-yellow-400 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <ListBullets size={16} weight={viewMode === "containers" ? "bold" : "regular"} />
                Fretes ({total})
              </button>
            </div>
          )}
          {viewMode === "frota" && (
            <button
              onClick={() => setAllFleetMapOpen(true)}
              className="btn primary flex items-center justify-center gap-2 shadow-sm font-semibold w-full sm:w-auto"
            >
              <Compass size={18} weight="bold" />
              Ver Toda a Frota no Mapa
            </button>
          )}
          <div className="grid grid-cols-2 sm:flex items-center gap-2">
            <button onClick={exportCsv} className="btn secondary justify-center">
              <DownloadSimple size={17} />
              Exportar
            </button>
            <Link
              href={demo ? "/login" : "/cadastro?tab=containers"}
              className="btn secondary justify-center"
            >
              <Plus size={18} />
              Novo frete
            </Link>
          </div>
        </div>
      </div>

      {!messages && viewMode === "containers" && (
        <div className="metrics">
          {[
            {
              title: "Fretes cadastrados",
              value: total,
              icon: Package,
              sub: "Visibilidade de ponta a ponta",
            },
            {
              title: "Em trânsito",
              value: transit,
              icon: Truck,
              sub: "A caminho do portão",
            },
            {
              title: "No portão",
              value: gateCount,
              icon: MapPin,
              sub: "Chegada identificada por GPS",
            },
            {
              title: "Entregues",
              value: delivered,
              icon: CheckCircle,
              sub: "Operações concluídas",
            },
          ].map((m, i) => (
            <div className="metric" key={m.title}>
              <div className="flex justify-between items-center text-slate-500 text-sm">
                <span>{m.title}</span>
                <m.icon size={20} className={i === 2 ? "text-emerald-700" : ""} />
              </div>
              <strong>{String(m.value).padStart(2, "0")}</strong>
              <small>
                {i === 1 && <span className="status-dot" />}
                {m.sub}
              </small>
            </div>
          ))}
        </div>
      )}
      {!messages && viewMode === "containers" && (
        <div className="overview-grid">
          <section className="panel overflow-hidden">
            <div className="panel-heading">
              <div>
                <h2>Portão monitorado</h2>
                <p>{gate ? gate.name : "Seu próximo ponto de conexão"}</p>
              </div>
              <span className="badge neutral">
                <span />
                {gate ? "Área configurada" : "A configurar"}
              </span>
            </div>
            <div className="port-map">
              {gate && !demo ? (
                <iframe
                  title={"Mapa do portão " + gate.name}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${gate.longitude - 0.015}%2C${gate.latitude - 0.009}%2C${gate.longitude + 0.015}%2C${gate.latitude + 0.009}&layer=mapnik&marker=${gate.latitude}%2C${gate.longitude}`}
                />
              ) : (
                <>
                  <svg
                    viewBox="0 0 850 330"
                    preserveAspectRatio="xMidYMid slice"
                    aria-hidden="true"
                  >
                    <rect width="850" height="330" fill="#e9ede7" />
                    <path
                      d="M575 -20C530 88 690 125 645 220S560 290 615 360H880V-20Z"
                      fill="#ccdeda"
                    />
                    <g stroke="#d6ddd3" strokeWidth="1">
                      {Array.from({ length: 14 }, (_, i) => (
                        <path key={i} d={`M${i * 65} 0L${i * 65 - 100} 330`} />
                      ))}
                      {Array.from({ length: 7 }, (_, i) => (
                        <path key={i} d={`M0 ${i * 55}H700`} />
                      ))}
                    </g>
                    <g stroke="#fafbf7" strokeWidth="14" fill="none">
                      <path d="M-20 140L250 130 400 220 620 220" />
                      <path d="M100 0L270 330" />
                      <path d="M360 0L440 150 530 330" />
                    </g>
                    <g fill="#b5c2b4">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <rect
                          key={i}
                          x={530 + i * 16}
                          y={120 + i * 8}
                          width="9"
                          height="57"
                          rx="2"
                          transform="rotate(-18 560 150)"
                        />
                      ))}
                    </g>
                    <path
                      d="M100 140L255 134 399 218 546 218"
                      stroke="#448e79"
                      strokeWidth="4"
                      strokeDasharray="8 6"
                      fill="none"
                    />
                    <circle
                      cx="547"
                      cy="218"
                      r="52"
                      fill="#438c731a"
                      stroke="#438c73"
                      strokeDasharray="5 5"
                    />
                    <circle
                      cx="547"
                      cy="218"
                      r="9"
                      fill="#205e4b"
                      stroke="#fff"
                      strokeWidth="4"
                    />
                    <text
                      x="650"
                      y="140"
                      fill="#7a9c95"
                      fontSize="14"
                      transform="rotate(20 650 140)"
                    >
                      ÁREA PORTUÁRIA
                    </text>
                  </svg>
                  <div className="map-marker">
                    <MapPin size={18} weight="fill" />
                    {gate ? "Portão de saída" : "Cadastre o portão do porto"}
                  </div>
                  <span className="map-caption">
                    Visão esquemática ·{" "}
                    {demo ? "dados de exemplo" : "sem localização cadastrada"}
                  </span>
                </>
              )}
            </div>
            <div className="map-footer">
              <span>
                <span className="status-dot" />
                {gate
                  ? `Raio de entrada: ${gate.radiusM} metros`
                  : "Defina as coordenadas e o raio do portão"}
              </span>
              <Link href={demo ? "/login" : "/cadastro?tab=gates"}>
                Gerenciar portões <ArrowUpRight size={15} />
              </Link>
            </div>
          </section>
          <section className="automation-panel">
            <div className="flex justify-between items-center">
              <span className="automation-icon">
                <WhatsappLogo size={26} />
              </span>
              <span className="text-xs border border-white/20 rounded-full px-3 py-1">
                {data.whatsappReady ? "Configurado" : "Configuração pendente"}
              </span>
            </div>
            <div>
              <p className="text-emerald-200/80 text-xs tracking-widest mb-2">
                AVISOS AUTOMÁTICOS
              </p>
              <h2>
                O container chega.
                <br />
                Seu cliente fica sabendo.
              </h2>
              <p className="automation-description">
                A entrada no portão atualiza o frete e prepara o aviso pelo
                WhatsApp.
              </p>
            </div>
            <div className="automation-steps">
              <span>
                <NavigationArrow size={17} />
                GlobalSAT no cavalo
              </span>
              <ArrowRight size={14} />
              <span>
                <MapPin size={17} />
                Portão
              </span>
              <ArrowRight size={14} />
              <WhatsappLogo size={20} />
            </div>
            <Link
              href={demo ? "/login" : "/cadastro?tab=settings"}
              className="automation-link"
            >
              Configurar integração <ArrowUpRight size={18} />
            </Link>
          </section>
        </div>
      )}
      {messages ? (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Histórico de avisos</h2>
              <p>
                “Aceito” confirma o envio ao provedor (Meta ou e-mail), não a
                leitura pelo destinatário.
              </p>
            </div>
          </div>
          <div className="p-5 space-y-4">
            {data.notifications.length ? (
              data.notifications.map((n) => (
                <article key={n.id} className="notification-row">
                  <div>
                    <b>{n.container.code}</b>
                    <p className="my-2">{n.body}</p>
                    <small>{date(n.createdAt)}</small>
                    {n.error && (
                      <p className="text-amber-700 text-xs mt-2">{n.error}</p>
                    )}
                  </div>
                  <div className="space-y-3">
                    <span className={`badge ${n.status.toLowerCase()}`}>
                      <span />
                      {notificationLabel(n)}
                    </span>
                    {!demo &&
                      ["FAILED", "UNCONFIGURED", "PENDING", "NO_CONSENT"].includes(
                        n.status,
                      ) && (
                        <button
                          disabled={busy}
                          className="btn secondary"
                          onClick={() =>
                            action("/api/notifications/" + n.id + "/retry")
                          }
                        >
                          Tentar envio
                        </button>
                      )}
                  </div>
                </article>
              ))
            ) : (
              <Empty
                title="Nenhum aviso registrado"
                text="As saídas confirmadas do porto aparecerão aqui, junto com o resultado de cada envio."
              />
            )}
          </div>
        </section>
      ) : viewMode === "frota" ? (
        <section className="mt-6">
          {/* Toolbar: Filter Tabs & Search (Mobile-First) */}
          <div className="panel p-3 sm:p-4 mb-5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 sm:gap-4">
            <div className="filter-tabs flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full md:w-auto py-0.5">
              {[
                ["TODOS", `Todos (${fleetTotal})`],
                ["EM_VIAGEM", `Em Trânsito (${fleetInTransit})`],
                ["NA_ADUANA", `Na Aduana (${fleetInCustoms})`],
                ["DISPONIVEL", `Pátio (${fleetAvailable})`],
              ].map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => setFleetFilter(v)}
                  className={`min-h-[36px] px-3 py-1.5 text-xs rounded-lg transition whitespace-nowrap shrink-0 ${
                    fleetFilter === v ? "selected font-bold" : "text-slate-600"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <label className="search-box flex-1 md:w-80 min-h-[38px]">
                <MagnifyingGlass size={18} className="shrink-0 text-slate-400" />
                <input
                  aria-label="Buscar na frota"
                  placeholder="Buscar placa, motorista, container…"
                  value={fleetQuery}
                  onChange={(e) => setFleetQuery(e.target.value)}
                  className="w-full text-xs"
                />
              </label>
              {fleetQuery && (
                <button
                  onClick={() => setFleetQuery("")}
                  className="btn secondary px-2.5 min-h-[38px] text-xs text-slate-400 hover:text-slate-600 shrink-0"
                  title="Limpar busca"
                >
                  <X size={15} />
                </button>
              )}
            </div>
          </div>

          {/* Cards Grid */}
          {filteredFleet.length ? (
            <div className="fleet-grid">
              {filteredFleet.map((t) => (
                <article key={t.plate} className="fleet-card">
                  {/* Card Header */}
                  <div className="fleet-card-header">
                    <div className="flex items-center gap-3">
                      <span className="w-10 h-10 rounded-xl bg-slate-900 text-yellow-400 flex items-center justify-center font-bold shadow-xs border border-yellow-400/30 shrink-0">
                        <Truck size={22} weight="fill" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <b className="fleet-plate-badge">{t.plate}</b>
                          {t.activeFreight?.trailerPlate && (
                            <span className="text-[11px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                              + {t.activeFreight.trailerPlate}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-slate-500 block mt-0.5 truncate max-w-[200px]">
                          {t.driver?.name || "Sem motorista vinculado"}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0">
                      <span
                        className={`badge ${
                          t.status === "EM_VIAGEM"
                            ? "em_viagem"
                            : t.status === "NA_ADUANA"
                              ? "na_aduana"
                              : "disponivel"
                        }`}
                      >
                        <span />
                        {t.statusLabel}
                      </span>
                    </div>
                  </div>

                  {/* Localização da Última Posição */}
                  <div className="flex items-center gap-2 py-2 mt-1 text-xs text-slate-700 min-w-0">
                    <MapPin size={16} weight="fill" className="text-yellow-500 shrink-0" />
                    <span className="font-semibold text-slate-900 truncate">
                      {t.lastPosition?.cityName || t.lastPosition?.shortLabel || t.lastPosition?.locationLabel || "Katueté (Sede da MANU)"}
                    </span>
                  </div>

                  {/* Status Operacional / Frete */}
                  <div className="my-2 flex-1">
                    {t.activeFreight ? (
                      <div className="p-3 rounded-xl border border-yellow-200 bg-yellow-50/60 text-xs space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-800">
                          <span className="font-mono text-slate-900">{t.activeFreight.code}</span>
                          {t.activeFreight.crt && (
                            <span className="text-[10px] text-slate-500 font-normal">CRT: {t.activeFreight.crt}</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-600 truncate">
                          {t.activeFreight.origin || "Porto"} → <b className="text-slate-900">{t.activeFreight.destination || "Destino"}</b>
                        </div>
                      </div>
                    ) : t.status === "DISPONIVEL" || t.lastPosition?.isAtCompanyYard || t.lastPosition?.cityName?.toLowerCase().includes("katuet") ? (
                      <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/80 text-xs text-slate-600 flex items-center gap-2">
                        <CheckCircle size={15} weight="fill" className="text-emerald-600 shrink-0" />
                        <span className="truncate font-medium text-slate-700">Disponível no pátio · Katueté (Sede)</span>
                      </div>
                    ) : t.status === "NA_ADUANA" || t.lastPosition?.isAtAduana ? (
                      <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/60 text-xs text-amber-900 flex items-center gap-2">
                        <Clock size={15} weight="bold" className="text-amber-600 shrink-0" />
                        <span className="truncate font-medium">Aguardando liberação · Aduana ({t.lastPosition?.cityName || "Fronteira"})</span>
                      </div>
                    ) : (
                      <div className="p-3 rounded-xl border border-yellow-100 bg-yellow-50/50 text-xs text-slate-700 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse shrink-0" />
                        <span className="truncate font-medium">
                          Em viagem de rota · {t.lastPosition?.cityName || "Em trânsito"}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Quick Action Buttons (Optimized for Mobile Touch) */}
                  <div className="fleet-actions-container">
                    {/* Primary Hero Button: Ver no Mapa em Tempo Real */}
                    <button
                      onClick={() => setMapTruck(t)}
                      className="btn primary w-full justify-center text-xs py-2.5 font-semibold flex items-center gap-2 shadow-xs"
                      title="Ver posição e traçado no mapa em tempo real"
                    >
                      <Compass size={16} weight="bold" />
                      <span>Ver no Mapa em Tempo Real</span>
                    </button>

                    {/* Secondary Row: Documento & Histórico (2 Equal Columns) */}
                    <div className="grid grid-cols-2 gap-2">
                      {t.activeFreight?.document ? (
                        <a
                          href={`/api/documents/${t.activeFreight.document.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn secondary text-xs py-2 px-2 min-h-[38px] flex items-center justify-center gap-1.5 text-slate-700 hover:text-amber-900 hover:border-amber-300 transition"
                          title="Abrir PDF do MIC-DTA / CRT do frete ativo"
                        >
                          <FilePdf size={15} className="text-red-600 shrink-0" />
                          <span className="truncate">Documento</span>
                        </a>
                      ) : t.tripHistory[0]?.document ? (
                        <a
                          href={`/api/documents/${t.tripHistory[0].document.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn secondary text-xs py-2 px-2 min-h-[38px] flex items-center justify-center gap-1.5 text-slate-500 hover:text-amber-900 hover:border-amber-300 transition"
                          title="Abrir PDF do último frete concluído"
                        >
                          <FilePdf size={15} className="text-slate-400 shrink-0" />
                          <span className="truncate">Último Doc</span>
                        </a>
                      ) : (
                        <button
                          disabled
                          className="btn secondary text-xs py-2 px-2 min-h-[38px] flex items-center justify-center gap-1.5 opacity-40 cursor-not-allowed"
                          title="Nenhum documento anexado"
                        >
                          <FilePdf size={15} className="shrink-0" />
                          <span className="truncate">Sem Doc</span>
                        </button>
                      )}

                      <button
                        onClick={() => setHistoryTruck(t)}
                        className="btn secondary text-xs py-2 px-2 min-h-[38px] flex items-center justify-center gap-1.5 hover:bg-slate-100 transition"
                        title="Ver histórico de fretes efetuados"
                      >
                        <ClockCounterClockwise size={15} className="shrink-0 text-slate-500" />
                        <span className="truncate">Histórico ({t.totalTripsCompleted})</span>
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title="Nenhum caminhão encontrado"
              text="Tente outro termo ou filtro de status."
            />
          )}

          <div className="table-footer mt-5">
            <span>
              {filteredFleet.length} de {fleetTotal} caminhões rastreados
            </span>
            <span>
              {!data.globalSatSync.configured
                ? "GlobalSAT não configurada"
                : data.globalSatSync.status === "error"
                  ? "GlobalSAT com falha de sincronização"
                  : data.globalSatSync.lastSyncAt
                    ? `GlobalSAT sincronizada · ${date(data.globalSatSync.lastSyncAt)}`
                    : "GlobalSAT aguardando sincronização"}
            </span>
          </div>
        </section>
      ) : (
        <section className="panel freight-panel">
          <div className="panel-heading">
            <div className="flex items-center gap-3">
              <h2>Seus fretes</h2>
              <span className="count">{total}</span>
            </div>
            <span className="text-xs text-slate-400 hidden sm:block">
              {demo
                ? "Dados de demonstração"
                : "Atualização automática a cada 30 s"}
            </span>
          </div>
          <div className="table-toolbar">
            <div className="filter-tabs">
              {[
                ["TODOS", "Todos"],
                ["EM_TRANSITO", "Em trânsito"],
                ["CHEGADA_PORTAO", "No portão"],
                ["ENTREGUE", "Entregues"],
              ].map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => setFilter(v)}
                  className={filter === v ? "selected" : ""}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <label className="search-box">
                <MagnifyingGlass size={18} />
                <input
                  aria-label="Buscar fretes"
                  placeholder="Buscar container, cliente…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <button
                aria-label="Mostrar todos os status"
                className="btn secondary px-3"
                onClick={() =>
                  setFilter(filter === "LIBERADO" ? "TODOS" : "LIBERADO")
                }
              >
                <Funnel size={18} />
              </button>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>
                    CONTAINER <ArrowDown size={12} />
                  </th>
                  <th>CLIENTE / DESTINO</th>
                  <th>MOTORISTA</th>
                  <th>STATUS</th>
                  <th>ATUALIZAÇÃO</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => {
                      setSelected(c);
                      setEditing(false);
                      setFeedback("");
                    }}
                  >
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="container-icon">
                          <Package size={20} />
                        </span>
                        <div>
                          <b className="tracking-wide">{c.code}</b>
                          <small>{c.origin || "Origem não informada"}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <b>{c.client.name}</b>
                      <small>{c.destination || "Destino não informado"}</small>
                    </td>
                    <td>
                      <b>{c.driver?.name || "Sem motorista"}</b>
                      <small className="font-mono">
                        {c.driver?.plate || "—"}
                      </small>
                    </td>
                    <td>
                      <Badge status={c.status} />
                    </td>
                    <td className="text-slate-500 text-xs">
                      {date(c.updatedAt)}
                    </td>
                    <td>
                      <button aria-label={"Detalhes de " + c.code}>
                        <ArrowUpRight size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!rows.length && (
            <Empty
              title={
                total
                  ? "Nenhum frete encontrado"
                  : "Sua operação começa com o primeiro frete"
              }
              text={
                total
                  ? "Tente outro termo ou filtro."
                  : "Cadastre cliente, motorista e portão. Depois, vincule tudo em um novo frete."
              }
              href={demo ? "/login" : "/cadastro"}
              action="Começar cadastro"
            />
          )}
          <div className="table-footer">
            <span>
              {rows.length} de {total} fretes
            </span>
            <span>
              {demo
                ? "Rastreamento demonstrativo"
                : !data.globalSatSync.configured
                  ? "GlobalSAT não configurada"
                  : data.globalSatSync.status === "error"
                    ? "GlobalSAT com falha de sincronização"
                    : data.globalSatSync.lastSyncAt
                      ? `GlobalSAT sincronizada · ${date(data.globalSatSync.lastSyncAt)}`
                      : "GlobalSAT aguardando sincronização"}
            </span>
          </div>
        </section>
      )}
      {!messages && (
        <div className="bottom-grid">
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2>Últimas atualizações</h2>
              <Link
                className="text-xs text-emerald-800"
                href={demo ? "/login" : "/?view=mensagens"}
              >
                Ver histórico →
              </Link>
            </div>
            {data.notifications.length ? (
              data.notifications.slice(0, 3).map((n) => (
                <div className="activity" key={n.id}>
                  <span className="activity-icon">
                    <WhatsappLogo size={19} />
                  </span>
                  <div>
                    <b>{n.container.code}</b>
                    <p>{notificationLabel(n)}</p>
                  </div>
                  <small className="ml-auto">{date(n.createdAt)}</small>
                </div>
              ))
            ) : (
              <div className="activity">
                <Clock size={20} />
                <p>As próximas chegadas e notificações aparecerão aqui.</p>
              </div>
            )}
          </section>
          <section className="setup-note">
            <span className="container-icon">
              <CheckCircle size={23} />
            </span>
            <div>
              <h2>Uma operação conectada</h2>
              <p>
                {data.clients.length} clientes · {data.drivers.length}{" "}
                motoristas · {data.gates.length} portões cadastrados
              </p>
              <Link href={demo ? "/login" : "/cadastro"}>
                Gerenciar cadastros <ArrowRight size={14} />
              </Link>
            </div>
          </section>
        </div>
      )}
      {feedback && !selected && (
        <p role="status" className="feedback">
          {feedback}
        </p>
      )}
      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-title"
            className="detail-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close-modal"
              aria-label="Fechar detalhes"
              onClick={() => setSelected(null)}
            >
              <X size={24} />
            </button>
            <div className="eyebrow">DETALHES DO FRETE</div>
            <h2 id="detail-title" className="text-2xl my-3">
              {selected.code}
            </h2>
            <Badge status={selected.status} />
            {!demo && (
              <div className="flex gap-2 mt-5">
                <button
                  type="button"
                  className="btn secondary"
                  disabled={busy}
                  onClick={() => setEditing(!editing)}
                >
                  <PencilSimple size={16} />
                  {editing ? "Cancelar alteração" : "Alterar frete"}
                </button>
                <button
                  type="button"
                  className="btn danger"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      !window.confirm(
                        `Excluir definitivamente o frete ${selected.code}? Os eventos e avisos vinculados também serão excluídos.`,
                      )
                    )
                      return;
                    const result = await action(
                      "/api/containers/" + selected.id,
                      "DELETE",
                    );
                    if (result) {
                      setSelected(null);
                      setEditing(false);
                      setFeedback("Frete excluído.");
                    }
                  }}
                >
                  <Trash size={16} />
                  Excluir frete
                </button>
              </div>
            )}
            {editing && !demo && (
              <form
                className="edit-freight-form mt-5"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  const payload = Object.fromEntries(form.entries());
                  const result = await action(
                    "/api/containers/" + selected.id,
                    "PATCH",
                    payload,
                  );
                  if (result) {
                    setSelected(result);
                    setEditing(false);
                    setFeedback("Frete alterado com sucesso.");
                  }
                }}
              >
                <div className="form-grid">
                  {[
                    ["code", "Número do container", selected.code],
                    ["origin", "Origem", selected.origin],
                    ["destination", "Destino", selected.destination],
                    ["crt", "CRT", selected.crt],
                    ["micDta", "MIC/DTA", selected.micDta],
                    ["truckPlate", "Placa do cavalo", selected.truckPlate],
                    ["trailerPlate", "Placa da carreta", selected.trailerPlate],
                    ["freightValue", "Valor do frete", selected.freightValue],
                    ["freightCurrency", "Moeda", selected.freightCurrency],
                    ["seal", "Lacre", selected.seal],
                    ["cargoDescription", "Conteúdo da carga", selected.cargoDescription],
                  ].map(([name, label, value]) => (
                    <label key={name}>
                      {label}
                      <input
                        name={name}
                        defaultValue={value || ""}
                        required={["code", "origin", "destination"].includes(
                          name!,
                        )}
                      />
                    </label>
                  ))}
                  <label>
                    Cliente
                    <select
                      name="clientId"
                      defaultValue={selected.clientId}
                      required
                    >
                      {data.clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Motorista
                    <select
                      name="driverId"
                      defaultValue={selected.driverId}
                      required
                    >
                      {data.drivers.map((driver) => (
                        <option key={driver.id} value={driver.id}>
                          {driver.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Portão
                    <input
                      name="geofenceId"
                      type="hidden"
                      value={selected.geofenceId || ""}
                    />
                    <input
                      readOnly
                      value="Porto de Paranaguá · seleção automática"
                    />
                  </label>
                  <label>
                    Tempo previsto (horas)
                    <input
                      name="transitHours"
                      type="number"
                      min={1}
                      max={720}
                      defaultValue={selected.transitHours}
                      required
                    />
                  </label>
                </div>
                <button className="btn primary mt-4" disabled={busy}>
                  Salvar alterações
                </button>
              </form>
            )}
            <dl className="detail-list">
              <dt>Cliente</dt>
              <dd>{selected.client.name}</dd>
              <dt>Motorista</dt>
              <dd>{selected.driver?.name || "—"}</dd>
              <dt>CRT / MIC-DTA</dt>
              <dd>
                {selected.crt || "—"} / {selected.micDta || "—"}
              </dd>
              <dt>Cavalo / carreta</dt>
              <dd>
                {selected.truckPlate || selected.driver?.plate || "—"} /{" "}
                {selected.trailerPlate || "—"}
              </dd>
              <dt>Valor do frete</dt>
              <dd>
                {selected.freightValue
                  ? `${selected.freightCurrency || ""} ${Number(selected.freightValue).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                  : "—"}
              </dd>
              <dt>Lacre</dt>
              <dd>{selected.seal || "—"}</dd>
              <dt>Saída do porto</dt>
              <dd>
                {selected.departedAt
                  ? date(selected.departedAt)
                  : "Aguardando confirmação do GPS"}
              </dd>
              <dt>Previsão de chegada</dt>
              <dd>
                {selected.estimatedArrivalAt
                  ? date(selected.estimatedArrivalAt) +
                    " · Brasília (estimativa)"
                  : "A confirmar após a saída"}
              </dd>
              <dt>Duração planejada</dt>
              <dd>
                {selected.transitHours
                  ? selected.transitHours + " horas"
                  : "Não informada"}
              </dd>
              {selected.routeDurationSeconds && (
                <>
                  <dt>Rota e margem operacional</dt>
                  <dd>
                    {(selected.routeDurationSeconds / 3600).toFixed(1)} h +{" "}
                    {((selected.operationalMarginSeconds || 0) / 3600).toFixed(
                      1,
                    )}{" "}
                    h
                  </dd>
                </>
              )}
              {(selected.documentLinks || (selected.document ? [{ document: selected.document }] : [])).map(
                ({ document: attached }) => (
                  <div key={attached.id}>
                    <dt>Documento</dt>
                    <dd>
                      <a
                        className="underline"
                        href={`/api/documents/${attached.id}`}
                      >
                        {attached.filename}
                      </a>
                    </dd>
                  </div>
                ),
              )}
              <dt>Trajeto</dt>
              <dd>
                {selected.origin} → {selected.destination}
              </dd>
            </dl>
            <JourneyProgress freight={selected} gates={data.gates} />
            {demo ? (
              <p>
                Entre na operação para cadastrar e acompanhar seus próprios
                fretes.
              </p>
            ) : (
              <>
                <h3 className="font-semibold mb-2">
                  Previsão e acompanhamento do cliente
                </h3>
                <form
                  className="mb-5"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const hours = Number(
                      new FormData(e.currentTarget).get("hours"),
                    );
                    const r = await action(
                      `/api/containers/${selected.id}/planning`,
                      "PATCH",
                      { transitHours: hours },
                    );
                    if (r)
                      setSelected({
                        ...selected,
                        transitHours: hours,
                        estimatedArrivalAt: selected.departedAt
                          ? new Date(
                              new Date(selected.departedAt).getTime() +
                                hours * 3600000,
                            ).toISOString()
                          : undefined,
                      });
                  }}
                >
                  <label>
                    Duração total prevista desde a saída (horas)
                    <input
                      key={selected.id}
                      name="hours"
                      type="number"
                      min={1}
                      max={720}
                      required
                      defaultValue={selected.transitHours}
                    />
                  </label>
                  <button
                    className="btn secondary mt-2"
                    disabled={busy || selected.status === "ENTREGUE"}
                  >
                    Atualizar previsão
                  </button>
                </form>
                <button
                  className="btn secondary mb-4"
                  disabled={busy || !selected.departedAt}
                  onClick={async () => {
                    const r = await action(
                      `/api/containers/${selected.id}/customer-link`,
                    );
                    if (r)
                      setFeedback(
                        "Link do cliente (substitui o anterior): " + r.url,
                      );
                  }}
                >
                  Gerar novo link do cliente após saída
                </button>
                <h3 className="font-semibold mb-2">Rastreamento GlobalSAT</h3>
                <p className="text-sm text-slate-500 mb-4">
                  As posições vêm do rastreador instalado no cavalo, identificado
                  pela placa vinculada ao frete. Não é necessário acessar o
                  celular do motorista.
                </p>
                <h3 className="font-semibold mt-8 mb-2">Atualização manual</h3>
                <p className="text-sm text-slate-500 mb-3">
                  Avance a etapa após confirmar a operação. Esta ação não envia
                  WhatsApp.
                </p>
                <select
                  aria-label="Atualizar status"
                  value=""
                  disabled={busy}
                  onChange={async (e) => {
                    if (!e.target.value) return;
                    const p = await action(
                      "/api/containers/" + selected.id + "/status",
                      "PATCH",
                      { status: e.target.value },
                    );
                    if (p) setSelected({ ...selected, status: p.status });
                  }}
                >
                  <option value="">Selecionar próxima etapa</option>
                  {CONTAINER_STATUSES.filter(
                    (s) =>
                      CONTAINER_STATUSES.indexOf(s) >
                      CONTAINER_STATUSES.indexOf(
                        selected.status as ContainerStatus,
                      ),
                  )
                    .filter((s) => s !== "A_CAMINHO_DESTINO")
                    .map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                </select>
              </>
            )}
            {feedback && (
              <p role="status" className="feedback">
                {feedback}
              </p>
            )}
          </section>
        </div>
      )}
      {/* Fleet Map Modal (Single Truck or All Fleet) */}
      <FleetMapModal
        isOpen={!!mapTruck}
        onClose={() => setMapTruck(null)}
        mode="single"
        truck={mapTruck}
      />

      <FleetMapModal
        isOpen={allFleetMapOpen}
        onClose={() => setAllFleetMapOpen(false)}
        mode="all"
        allTrucks={fleet}
      />

      {/* Fleet History Slide-over Drawer */}
      <FleetHistoryDrawer
        isOpen={!!historyTruck}
        onClose={() => setHistoryTruck(null)}
        truck={historyTruck}
      />

    </Shell>
  );
}
function Empty({
  title,
  text,
  href,
  action,
}: {
  title: string;
  text: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="empty-state">
      <Package size={32} />
      <h3>{title}</h3>
      <p>{text}</p>
      {href && (
        <Link className="btn secondary" href={href}>
          {action}
          <ArrowRight size={16} />
        </Link>
      )}
    </div>
  );
}
