"use client";
import { Suspense, useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import Shell from "@/components/shell";
import { findMatchingDriver, normalizeName } from "@/lib/driver-match";
import { toTripExtractions } from "@/lib/document-extraction";
import {
  DocumentFields,
  emptyFields,
  fieldLabels,
} from "@/lib/document-fields";
type Row = { id: string; name: string; plate?: string; active?: boolean };
type DocLink = { containerId: string; container: { code: string } };
type Doc = {
  id: string;
  filename?: string;
  links: DocLink[];
  extracted: unknown;
};
function Importer() {
  const [docs, setDocs] = useState<Doc[]>([]),
    [doc, setDoc] = useState<Doc | null>(null);
  const [fields, setFields] = useState({ ...emptyFields }),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [provider, setProvider] = useState("none");
  const [routeDetails, setRouteDetails] = useState<{
    routeDurationSeconds: number;
    operationalMarginSeconds: number;
  } | null>(null);
  const [clients, setClients] = useState<Row[]>([]),
    [drivers, setDrivers] = useState<Row[]>([]),
    [gates, setGates] = useState<Row[]>([]);
  const [clientId, setClientId] = useState(""),
    [driverId, setDriverId] = useState(""),
    [geofenceId, setGeofenceId] = useState(""),
    [transitHours, setTransitHours] = useState(""),
    [tripIndex, setTripIndex] = useState(0),
    [planning, setPlanning] = useState(false);
  type Lists = { clients: Row[]; drivers: Row[]; gates: Row[] };
  async function reload(): Promise<
    Lists & { docs: Doc[]; ready: boolean; provider: string }
  > {
    const results = await Promise.all(
      ["documents", "clients", "drivers", "geofences"].map(async (p) => {
        const r = await fetch("/api/" + p);
        if (!r.ok) throw new Error("Não foi possível carregar os dados.");
        return r.json();
      }),
    );
    const fresh = {
      docs: results[0].documents as Doc[],
      ready: results[0].ready as boolean,
      provider: results[0].provider as string,
      clients: results[1] as Row[],
      drivers: results[2] as Row[],
      gates: results[3] as Row[],
    };
    setDocs(fresh.docs);
    setReady(fresh.ready);
    setProvider(fresh.provider);
    setClients(fresh.clients);
    setDrivers(fresh.drivers);
    setGates(fresh.gates);
    return fresh;
  }
  useEffect(() => {
    reload().catch((e) => setMessage(e.message));
  }, []);
  function select(d: Doc, lists?: Lists, index = 0) {
    const knownClients = lists?.clients ?? clients;
    const knownDrivers = lists?.drivers ?? drivers;
    const knownGates = lists?.gates ?? gates;
    const tripList = toTripExtractions(d.extracted);
    const safeIndex = tripList.length
      ? Math.min(Math.max(index, 0), tripList.length - 1)
      : 0;
    const tripFields = tripList[safeIndex]?.fields || emptyFields;
    setDoc(d);
    setTripIndex(safeIndex);
    setFields({ ...emptyFields, ...tripFields });
    const matches = knownClients.filter(
      (c) => normalizeName(c.name) === normalizeName(tripFields.clientName),
    );
    setClientId(matches.length === 1 ? matches[0].id : "");
    const matchedDriver = findMatchingDriver(
      knownDrivers,
      tripFields.driverName,
      tripFields.truckPlate,
    );
    setDriverId(matchedDriver?.id ?? "");
    setGeofenceId(
      knownGates.find((g) => g.active && normalizeName(g.name).includes("PARANAGUA"))
        ?.id || "",
    );
    setTransitHours("");
    setRouteDetails(null);
  }
  async function estimatePlanning(destination: string) {
    setRouteDetails(null);
    setPlanning(true);
    try {
      const response = await fetch("/api/route-estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination }),
      });
      const result = await response.json();
      if (result.geofenceId) setGeofenceId(result.geofenceId);
      if (!response.ok) throw new Error(result.error);
      setTransitHours(String(result.transitHours));
      setRouteDetails({
        routeDurationSeconds: result.routeDurationSeconds,
        operationalMarginSeconds: result.operationalMarginSeconds,
      });
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message + " Informe o tempo manualmente."
          : "Não foi possível estimar a rota. Informe o tempo manualmente.",
      );
    } finally {
      setPlanning(false);
    }
  }
  async function upload(file: File) {
    setBusy(true);
    setMessage("");
    setDoc(null);
    try {
      if (file.size > 4000000) throw new Error("Limite de 4 MB por arquivo.");
      const data = new FormData();
      data.set("file", file);
      const r = await fetch("/api/documents", { method: "POST", body: data });
      const d = (await r.json().catch(() => null)) as (Doc & {
        error?: string;
      }) | null;
      if (!r.ok || !d || !d.id)
        throw new Error(
          d?.error || `Falha no envio (HTTP ${r.status}). Tente novamente.`,
        );
      const fresh = await reload();
      select(d, fresh, 0);
      await estimatePlanning(toTripExtractions(d.extracted)[0]?.fields.destination || "");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha no envio.");
    } finally {
      setBusy(false);
    }
  }
  async function removeDoc(id: string, filename?: string) {
    if (
      !window.confirm(
        `Excluir definitivamente o documento ${filename || ""}? Esta ação não pode ser desfeita.`,
      )
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(d?.error || "Não foi possível excluir.");
      if (doc?.id === id) setDoc(null);
      setMessage("Documento excluído.");
      await reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha ao excluir.");
    } finally {
      setBusy(false);
    }
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!doc) return;
    setBusy(true);
    setMessage("");
    const f = new FormData(e.currentTarget);
    try {
      const r = await fetch(`/api/documents/${doc.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields,
          clientId,
          driverId,
          geofenceId,
          whatsapp: f.get("whatsapp") || "",
          consent: f.get("consent") === "on",
          confirmed: f.get("confirmed") === "on",
          transitHours: Number(f.get("transitHours")),
          ...routeDetails,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      const savedCode = fields.code;
      setMessage(`Frete ${savedCode} cadastrado com o documento anexado.`);
      const fresh = await reload();
      const updated = fresh.docs.find((item) => item.id === doc.id);
      if (updated) {
        const codes = new Set(updated.links.map((l) => l.container.code));
        const updatedTrips = toTripExtractions(updated.extracted);
        const next = updatedTrips.findIndex(
          (trip, i) =>
            i > tripIndex && trip.fields.code && !codes.has(trip.fields.code),
        );
        select(updated, fresh, next >= 0 ? next : tripIndex);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }
  const trips = doc ? toTripExtractions(doc.extracted) : [];
  const trip = trips[tripIndex];
  const registeredCodes = new Set(
    (doc?.links || []).map((l) => l.container.code),
  );
  const tripRegistered =
    !!trip?.fields.code && registeredCodes.has(trip.fields.code);
  const docWarning =
    doc &&
    typeof (doc.extracted as { warning?: unknown }).warning === "string"
      ? ((doc.extracted as { warning: string }).warning as string)
      : "";
  const pendingDocs = docs.filter((d) => {
    const list = toTripExtractions(d.extracted);
    if (!list.length) return true;
    const codes = new Set(d.links.map((l) => l.container.code));
    return list.some((t) => !t.fields.code || !codes.has(t.fields.code));
  });
  const doneDocs = docs.filter((d) => {
    const list = toTripExtractions(d.extracted);
    if (!list.length) return false;
    const codes = new Set(d.links.map((l) => l.container.code));
    return list.every((t) => t.fields.code && codes.has(t.fields.code));
  });
  return (
    <Shell>
      <div className="page-heading">
        <div>
          <div className="eyebrow">DOCUMENTOS DA VIAGEM</div>
          <h1>Importar frete</h1>
          <p>Envie o MIC/DTA ou CRT, confira os dados e cadastre a viagem.</p>
        </div>
        <Link className="btn secondary" href="/">
          Voltar ao painel
        </Link>
      </div>
      <section className="panel form-panel">
        <h2>1. Enviar documento</h2>
        <p>
          Selecione um PDF, JPG ou PNG de até 4 MB. A leitura começa
          automaticamente e preenche os dados da viagem, cliente, motorista,
          veículo, destino e container com{" "}
          {provider === "gemini" ? "Google Gemini" : "OpenAI"}.
        </p>
        {!ready && (
          <p className="feedback">
            A leitura automática não está configurada. Ative um provedor de IA
            antes de enviar documentos.
          </p>
        )}
        <label>
          Arquivo da viagem
          <input
            required
            name="file"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            disabled={busy || !ready}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = "";
            }}
          />
        </label>
        {busy && (
          <p className="feedback">Lendo documento e preenchendo os dados…</p>
        )}
      </section>
      {message && (
        <p role="status" className="feedback">
          {message}
        </p>
      )}
      {doc && trips.length > 1 && (
        <section className="panel form-panel mt-6">
          <h2>
            Viagens do documento · {trips.length} ·{" "}
            {trips.filter((t) => t.fields.code && registeredCodes.has(t.fields.code)).length}{" "}
            cadastradas
          </h2>
          {trips.map((t, i) => {
            const done = !!t.fields.code && registeredCodes.has(t.fields.code);
            return (
              <div
                key={i}
                className="flex flex-wrap gap-3 justify-between border-b py-3"
              >
                <span>
                  {t.fields.code || `Viagem ${i + 1} (sem container)`} ·{" "}
                  {t.fields.driverName || "motorista a conferir"} ·{" "}
                  {t.fields.truckPlate || "placa a conferir"}
                  {done ? " · Cadastrada" : ""}
                </span>
                <div className="flex gap-3">
                  <button
                    disabled={busy || planning}
                    className="underline"
                    onClick={() => select(doc, undefined, i)}
                  >
                    {i === tripIndex ? "Editando" : "Conferir"}
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}
      {doc && trip && !tripRegistered && (
        <form
          key={`${doc.id}-${tripIndex}`}
          className="panel form-panel mt-6"
          onSubmit={save}
        >
          <h2>
            2. Conferir e cadastrar
            {trips.length > 1 ? ` · viagem ${tripIndex + 1} de ${trips.length}` : ""}
          </h2>
          <p>
            Confira especialmente container, CRT, placas e valor. Campos
            ilegíveis devem ser completados.{" "}
            <a href={`/api/documents/${doc.id}`} className="underline">
              Baixar original
            </a>
          </p>
          {(docWarning || trip.warning) && (
            <p className="feedback">{[docWarning, trip.warning].filter(Boolean).join(" ")}</p>
          )}
          <div className="form-grid">
            {(Object.keys(fieldLabels) as (keyof DocumentFields)[]).map((k) => (
              <label key={k}>
                {fieldLabels[k]}
                <input
                  value={fields[k]}
                  disabled={busy || planning}
                  onChange={(e) => {
                    setFields({ ...fields, [k]: e.target.value });
                    if (k === "destination") {
                      setRouteDetails(null);
                      setTransitHours("");
                    }
                    if (k === "clientName") setClientId("");
                    if (k === "driverName" || k === "truckPlate")
                      setDriverId("");
                  }}
                  required={[
                    "clientName",
                    "code",
                    "driverName",
                    "truckPlate",
                  ].includes(k)}
                  maxLength={k === "code" ? 11 : 160}
                  placeholder={k === "freightValue" ? "2200.00" : ""}
                />
              </label>
            ))}
            <label>
              Vincular cliente
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              >
                <option value="">Localizar ou criar automaticamente</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Vincular motorista
              <select
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
              >
                <option value="">Localizar ou criar automaticamente</option>
                {drivers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.plate}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Portão de saída · Paranaguá
              <input
                readOnly
                value={
                  gates.find((g) => g.id === geofenceId)?.name ||
                  "Porto de Paranaguá · seleção automática"
                }
              />
            </label>
            <label>
              Tempo previsto após a saída (horas)
              <input
                name="transitHours"
                type="number"
                required
                min={1}
                max={720}
                placeholder={
                  planning ? "Calculando rota…" : "Informe a estimativa total"
                }
                value={transitHours}
                onChange={(e) => {
                  setTransitHours(e.target.value);
                  setRouteDetails(null);
                }}
                disabled={planning}
              />
            </label>
            <div>
              <button
                type="button"
                className="btn secondary"
                disabled={busy || planning || !fields.destination}
                onClick={() => void estimatePlanning(fields.destination)}
              >
                Recalcular rota
              </button>
              {routeDetails && (
                <p>
                  Rota: {(routeDetails.routeDurationSeconds / 3600).toFixed(1)}{" "}
                  h · margem operacional:{" "}
                  {(routeDetails.operationalMarginSeconds / 3600).toFixed(1)} h.
                  Total arredondado para cima.
                </p>
              )}
            </div>
            {!clientId && (
              <label>
                WhatsApp do novo cliente (opcional)
                <input
                  name="whatsapp"
                  type="tel"
                  placeholder="+595…"
                  pattern="\+[1-9][0-9]{7,14}"
                />
              </label>
            )}
          </div>
          {!clientId && (
            <label className="flex gap-3 mt-5">
              <input type="checkbox" name="consent" />
              Cliente autorizou receber atualizações por WhatsApp.
            </label>
          )}
          <p className="text-sm text-slate-500 mt-5">
            Cliente e motorista selecionados serão reutilizados, sem alterar
            seus cadastros. Sem WhatsApp ou autorização, o aviso automático fica
            pendente.
          </p>
          <label className="flex gap-3 mt-5">
            <input type="checkbox" required name="confirmed" />
            Conferi os dados com o documento original.
          </label>
          <button disabled={busy || planning} className="btn primary mt-5">
            Cadastrar viagem
          </button>
        </form>
      )}
      {doc && trip && tripRegistered && (
        <p className="feedback">
          Este frete ({trip.fields.code}) já está vinculado ao documento.{" "}
          <Link href="/">Abrir painel →</Link>
        </p>
      )}
      <section className="panel form-panel mt-6">
        <h2>Aguardando conferência · {pendingDocs.length}</h2>
        {!pendingDocs.length ? (
          <p>Nenhum documento pendente.</p>
        ) : (
          pendingDocs.map((d) => (
            <div
              key={d.id}
              className="flex flex-wrap gap-3 justify-between border-b py-3"
            >
              <span>
                {d.filename} · {toTripExtractions(d.extracted).length || "sem"}{" "}
                viagem(ns) identificada(s)
              </span>
              <div className="flex gap-3">
                <a className="underline" href={`/api/documents/${d.id}`}>
                  Baixar
                </a>
                <button
                  disabled={busy || planning}
                  className="underline"
                  onClick={() => {
                    select(d, undefined, 0);
                    const first = toTripExtractions(d.extracted)[0];
                    void estimatePlanning(first?.fields.destination || "");
                  }}
                >
                  Conferir
                </button>
                <button
                  disabled={busy || planning}
                  className="underline"
                  onClick={() => void removeDoc(d.id, d.filename)}
                >
                  Excluir
                </button>
              </div>
            </div>
          ))
        )}
      </section>
      {!!doneDocs.length && (
        <section className="panel form-panel mt-6">
          <h2>Fretes já cadastrados</h2>
          {doneDocs.map((d) => (
            <div
              key={d.id}
              className="flex flex-wrap gap-3 justify-between border-b py-3"
            >
              <span>
                {d.filename} ·{" "}
                {d.links.map((l) => l.container.code).join(", ")}{" "}
                <Link href="/">Abrir painel →</Link>
              </span>
              <div className="flex gap-3">
                <a className="underline" href={`/api/documents/${d.id}`}>
                  Baixar
                </a>
              </div>
            </div>
          ))}
        </section>
      )}
    </Shell>
  );
}
export default function Page() {
  return (
    <Suspense>
      <Importer />
    </Suspense>
  );
}
