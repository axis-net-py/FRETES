"use client";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CheckCircle, Plus } from "@phosphor-icons/react";
import Shell from "@/components/shell";
type Row = {
  id: string;
  name: string;
  whatsapp?: string;
  phone?: string;
  plate?: string;
  radiusM?: number;
};
function Registration() {
  const params = useSearchParams();
  const tab = params.get("tab") || "clients";
  const [lists, setLists] = useState<Record<string, Row[]>>({
    clients: [],
    drivers: [],
    gates: [],
  });
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  async function reload() {
    try {
      const entries = await Promise.all(
        ["clients", "drivers", "gates"].map(async (key) => {
          const r = await fetch(
            "/api/" + (key === "gates" ? "geofences" : key),
          );
          if (!r.ok) throw new Error("Não foi possível carregar os cadastros.");
          return [key, await r.json()];
        }),
      );
      setLists(Object.fromEntries(entries));
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void reload();
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setFeedback("");
    const f = e.currentTarget;
    const d = Object.fromEntries(new FormData(f));
    const body =
      tab === "clients"
        ? { ...d, consent: d.consent === "on" }
        : tab === "gates"
          ? {
              ...d,
              latitude: Number(d.latitude),
              longitude: Number(d.longitude),
              radiusM: Number(d.radiusM),
            }
          : d;
    try {
      const r = await fetch("/api/" + (tab === "gates" ? "geofences" : tab), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || "Não foi possível salvar");
      setFeedback("Cadastro salvo com sucesso.");
      f.reset();
      await reload();
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  }
  const tabs = [
    ["clients", "Clientes"],
    ["drivers", "Motoristas"],
    ["gates", "Portos e portões"],
    ["containers", "Novo frete"],
    ["settings", "Integrações"],
  ];
  return (
    <Shell>
      <div className="page-heading">
        <div>
          <div className="eyebrow">BASE DA OPERAÇÃO</div>
          <h1>Cadastros e configurações</h1>
          <p>Conecte pessoas, containers e os pontos certos do trajeto.</p>
        </div>
        <Link href="/" className="btn secondary">
          Voltar ao painel <ArrowRight size={16} />
        </Link>
      </div>
      <nav className="form-tabs">
        {tabs.map(([id, title]) => (
          <Link
            className={tab === id ? "selected" : ""}
            href={"/cadastro?tab=" + id}
            key={id}
          >
            {title}
          </Link>
        ))}
      </nav>
      {feedback && (
        <p role="status" className="feedback max-w-3xl">
          {feedback}
        </p>
      )}
      {tab === "settings" ? (
        <section className="panel form-panel">
          <h2>WhatsApp Business · API da Meta</h2>
          <p>
            Configure as variáveis protegidas no projeto <b>fretes</b> da Vercel
            e faça um novo deploy.
          </p>
          <ol className="space-y-5 text-sm leading-relaxed">
            <li>
              <b>1. Prepare a conta Business.</b>
              <p className="text-slate-500">
                Cadastre o número remetente e obtenha um token de acesso de
                usuário de sistema.
              </p>
            </li>
            <li>
              <b>2. Aprove um template de utilidade.</b>
              <p className="text-slate-500">
                {
                  "Corpo sugerido: Olá {{1}}, atualização do container {{2}}: {{3}}. Local: {{4}}."
                }
              </p>
            </li>
            <li>
              <b>3. Configure as variáveis.</b>
              <div className="bg-slate-50 rounded-lg p-4 mt-2 text-xs space-y-2 font-mono break-all">
                {[
                  "WHATSAPP_PROVIDER=meta",
                  "META_WHATSAPP_TOKEN",
                  "META_WHATSAPP_PHONE_NUMBER_ID",
                  "META_WHATSAPP_TEMPLATE",
                  "META_GRAPH_VERSION",
                  "META_TEMPLATE_LANGUAGE=pt_BR",
                ].map((x) => (
                  <p key={x}>{x}</p>
                ))}
              </div>
            </li>
            <li>
              <b>4. Faça um teste autorizado.</b>
              <p className="text-slate-500">
                Cadastre o consentimento do cliente e acompanhe o histórico de
                mensagens após a chegada ao portão. A aceitação pela API não
                confirma a entrega ao destinatário.
              </p>
            </li>
          </ol>
          <a
            target="_blank"
            rel="noreferrer"
            className="btn primary mt-6"
            href="https://vercel.com/allaneggert1-9773s-projects/fretes/settings/environment-variables"
          >
            Abrir configuração na Vercel <ArrowRight size={16} />
          </a>
          <div className="mt-8 pt-5 border-t">
            <h2>Android e iOS</h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              A base já usa Capacitor com uma interface comum de GPS. A versão
              web exige a página aberta. O rastreamento com a tela bloqueada
              requer o módulo nativo de localização em segundo plano, permissões
              e testes em dispositivos físicos antes da publicação nas lojas.
            </p>
          </div>
        </section>
      ) : (
        <form key={tab} className="panel form-panel" onSubmit={submit}>
          <h2>{tabs.find((t) => t[0] === tab)?.[1] || "Clientes"}</h2>
          <p>
            {tab === "containers"
              ? "Vincule o container ao cliente, motorista e portão que deve disparar o aviso."
              : tab === "gates"
                ? "Use as coordenadas exatas do portão. Estar na área indica chegada, não liberação aduaneira."
                : "Os dados ficarão disponíveis para vincular aos seus fretes."}
          </p>
          <div className="form-grid">
            {(tab === "clients" || tab === "drivers") && (
              <>
                <label>
                  Nome {tab === "clients" ? "do cliente" : "do motorista"}
                  <input
                    name="name"
                    required
                    minLength={2}
                    maxLength={120}
                    placeholder={
                      tab === "clients"
                        ? "Nome da empresa ou cliente"
                        : "Nome completo"
                    }
                  />
                </label>
                <label>
                  {tab === "clients" ? "WhatsApp do cliente" : "Telefone"}
                  <input
                    name={tab === "clients" ? "whatsapp" : "phone"}
                    type="tel"
                    required
                    pattern="\+[1-9][0-9]{7,14}"
                    placeholder="+55… ou +595…"
                    title="Use + seguido do código do país e número, sem espaços."
                  />
                </label>
                {tab === "drivers" && (
                  <label>
                    Placa do caminhão
                    <input
                      name="plate"
                      maxLength={15}
                      placeholder="Placa do veículo"
                    />
                  </label>
                )}
              </>
            )}
            {tab === "gates" && (
              <>
                <label className="sm:col-span-2">
                  Porto, terminal e portão
                  <input
                    name="name"
                    required
                    minLength={2}
                    maxLength={120}
                    placeholder="Ex.: Terminal • Portão de liberação"
                  />
                </label>
                <label>
                  Latitude
                  <input
                    name="latitude"
                    type="number"
                    step="any"
                    min={-90}
                    max={90}
                    required
                    placeholder="-23.94215"
                  />
                </label>
                <label>
                  Longitude
                  <input
                    name="longitude"
                    type="number"
                    step="any"
                    min={-180}
                    max={180}
                    required
                    placeholder="-46.31056"
                  />
                </label>
                <label>
                  Raio de entrada (metros)
                  <input
                    name="radiusM"
                    type="number"
                    min={50}
                    max={2000}
                    required
                    defaultValue={300}
                  />
                </label>
                <p className="text-xs text-slate-500 self-center leading-relaxed">
                  O GPS precisa estar dentro do raio, considerando sua margem de
                  erro. Posições antigas ou imprecisas não disparam avisos.
                </p>
              </>
            )}
            {tab === "containers" && (
              <>
                <label>
                  Código do container
                  <input
                    name="code"
                    pattern="[A-Za-z]{4}[0-9]{7}"
                    maxLength={11}
                    required
                    placeholder="4 letras e 7 números"
                  />
                </label>
                <label>
                  Cliente
                  <select name="clientId" required defaultValue="">
                    <option value="" disabled>
                      Selecione o cliente
                    </option>
                    {lists.clients.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Motorista
                  <select name="driverId" required defaultValue="">
                    <option value="" disabled>
                      Selecione o motorista
                    </option>
                    {lists.drivers.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Portão de chegada
                  <select name="geofenceId" required defaultValue="">
                    <option value="" disabled>
                      Selecione o portão
                    </option>
                    {lists.gates.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Origem
                  <input
                    name="origin"
                    required
                    maxLength={160}
                    placeholder="Porto / cidade de origem"
                  />
                </label>
                <label>
                  Destino
                  <input
                    name="destination"
                    required
                    maxLength={160}
                    placeholder="Cidade / endereço de entrega"
                  />
                </label>
              </>
            )}
          </div>
          {tab === "clients" && (
            <label className="flex gap-3 items-start mt-6">
              <input type="checkbox" name="consent" />
              <span className="text-xs text-slate-500 leading-relaxed">
                Confirmo que o cliente autorizou receber atualizações deste
                frete por WhatsApp. Sem esta autorização, nenhum aviso será
                enviado.
              </span>
            </label>
          )}
          <button className="btn primary mt-7" disabled={busy || loading}>
            <Plus size={16} />
            {busy ? "Salvando…" : "Salvar cadastro"}
          </button>
          {tab === "containers" &&
            (!lists.clients.length ||
              !lists.drivers.length ||
              !lists.gates.length) && (
              <p className="feedback">
                Cadastre primeiro pelo menos um cliente, um motorista e um
                portão.
              </p>
            )}
        </form>
      )}
      {lists[tab] && (
        <section className="form-summary">
          <h2 className="mb-4">Cadastrados · {lists[tab].length}</h2>
          {loading ? (
            <p className="text-slate-400">Carregando…</p>
          ) : lists[tab].length ? (
            lists[tab].map((r) => (
              <article key={r.id}>
                <div>
                  <b>{r.name}</b>
                  <small>
                    {r.whatsapp || r.phone || r.radiusM + " m de raio"}
                    {r.plate && " · " + r.plate}
                  </small>
                </div>
                <CheckCircle size={18} className="text-emerald-700" />
              </article>
            ))
          ) : (
            <p className="text-sm text-slate-400">
              Nenhum registro ainda. Preencha o formulário acima.
            </p>
          )}
        </section>
      )}
    </Shell>
  );
}
export default function Page() {
  return (
    <Suspense>
      <Registration />
    </Suspense>
  );
}
