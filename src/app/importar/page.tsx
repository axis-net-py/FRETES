"use client";
import { Suspense, useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import Shell from "@/components/shell";
import { findMatchingDriver } from "@/lib/driver-match";
import {
  DocumentFields,
  emptyFields,
  fieldLabels,
} from "@/lib/document-fields";
type Row = { id: string; name: string; plate?: string; active?: boolean };
type Doc = {
  id: string;
  filename?: string;
  containerId: string | null;
  extracted: { fields: DocumentFields; warning: string };
};
function Importer() {
  const [docs, setDocs] = useState<Doc[]>([]),
    [doc, setDoc] = useState<Doc | null>(null);
  const [fields, setFields] = useState({ ...emptyFields }),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [provider, setProvider] = useState("none");
  const [clients, setClients] = useState<Row[]>([]),
    [drivers, setDrivers] = useState<Row[]>([]),
    [gates, setGates] = useState<Row[]>([]);
  const [clientId, setClientId] = useState(""),
    [driverId, setDriverId] = useState(""),
    [geofenceId, setGeofenceId] = useState(""),
    [transitHours, setTransitHours] = useState(""),
    [planning, setPlanning] = useState(false);
  async function reload() {
    const results = await Promise.all(
      ["documents", "clients", "drivers", "geofences"].map(async (p) => {
        const r = await fetch("/api/" + p);
        if (!r.ok) throw new Error("Não foi possível carregar os dados.");
        return r.json();
      }),
    );
    setDocs(results[0].documents);
    setReady(results[0].ready);
    setProvider(results[0].provider);
    setClients(results[1]);
    setDrivers(results[2]);
    setGates(results[3]);
  }
  useEffect(() => {
    reload().catch((e) => setMessage(e.message));
  }, []);
  function select(d: Doc) {
    setDoc(d);
    setFields({ ...emptyFields, ...d.extracted.fields });
    const matches = clients.filter(
      (c) =>
        c.name.trim().toUpperCase() ===
        d.extracted.fields.clientName.trim().toUpperCase(),
    );
    setClientId(matches.length === 1 ? matches[0].id : "");
    const matchedDriver = findMatchingDriver(
      drivers,
      d.extracted.fields.driverName,
      d.extracted.fields.truckPlate,
    );
    setDriverId(matchedDriver?.id ?? "");
    setGeofenceId("");
    setTransitHours("");
  }
  async function estimatePlanning(destination: string) {
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
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      select(d);
      await Promise.all([
        reload(),
        estimatePlanning(d.extracted.fields.destination),
      ]);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha no envio.");
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
          geofenceId: f.get("geofenceId") || "",
          whatsapp: f.get("whatsapp") || "",
          consent: f.get("consent") === "on",
          confirmed: f.get("confirmed") === "on",
          transitHours: Number(f.get("transitHours")),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setDoc({ ...doc, containerId: d.id });
      setMessage("Frete cadastrado com o documento anexado.");
      await reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }
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
          veículo, destino e container com {provider === "gemini" ? "Google Gemini" : "OpenAI"}.
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
        {busy && <p className="feedback">Lendo documento e preenchendo os dados…</p>}
      </section>
      {message && (
        <p role="status" className="feedback">
          {message}
        </p>
      )}
      {doc && !doc.containerId && (
        <form key={doc.id} className="panel form-panel mt-6" onSubmit={save}>
          <h2>2. Conferir e cadastrar</h2>
          <p>
            Confira especialmente container, CRT, placas e valor. Campos
            ilegíveis devem ser completados.{" "}
            <a href={`/api/documents/${doc.id}`} className="underline">
              Baixar original
            </a>
          </p>
          {doc.extracted.warning && (
            <p className="feedback">{doc.extracted.warning}</p>
          )}
          <div className="form-grid">
            {(Object.keys(fieldLabels) as (keyof DocumentFields)[]).map((k) => (
              <label key={k}>
                {fieldLabels[k]}
                <input
                  value={fields[k]}
                  onChange={(e) =>
                    setFields({ ...fields, [k]: e.target.value })
                  }
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
                <option value="">Criar cliente com o nome acima</option>
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
                <option value="">Criar motorista automaticamente</option>
                {drivers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.plate}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Portão de saída · Paranaguá
              <select
                name="geofenceId"
                required
                value={geofenceId}
                onChange={(e) => setGeofenceId(e.target.value)}
                disabled={planning}
              >
                <option value="">Selecionando automaticamente…</option>
                {gates
                  .filter((g) => g.active)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Tempo previsto após a saída (horas)
              <input
                name="transitHours"
                type="number"
                required
                min={1}
                max={720}
                placeholder={planning ? "Calculando rota…" : "Estimativa da rota + 4 horas"}
                value={transitHours}
                onChange={(e) => setTransitHours(e.target.value)}
                disabled={planning}
              />
            </label>
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
      {doc?.containerId && (
        <p className="feedback">
          Este documento já está vinculado a um frete.{" "}
          <Link href="/">Abrir painel →</Link>
        </p>
      )}
      <section className="panel form-panel mt-6">
        <h2>Documentos enviados</h2>
        {!docs.length ? (
          <p>Nenhum documento enviado.</p>
        ) : (
          docs.map((d) => (
            <div
              key={d.id}
              className="flex flex-wrap gap-3 justify-between border-b py-3"
            >
              <span>
                {d.filename} ·{" "}
                {d.containerId ? "Cadastrado" : "Aguardando conferência"}
              </span>
              <div className="flex gap-3">
                <a className="underline" href={`/api/documents/${d.id}`}>
                  Baixar
                </a>
                {!d.containerId && (
                  <button
                    disabled={busy}
                    className="underline"
                    onClick={() => {
                      select(d);
                      void estimatePlanning(d.extracted.fields.destination);
                    }}
                  >
                    Conferir
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </section>
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
