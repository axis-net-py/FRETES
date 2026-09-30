"use client";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Pencil,
  Plus,
  Trash,
  X,
} from "@phosphor-icons/react";
import Shell from "@/components/shell";

type Row = {
  id: string;
  name: string;
  whatsapp?: string;
  phone?: string;
  plate?: string;
  radiusM?: number;
  consent?: boolean;
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
  const [editingItem, setEditingItem] = useState<Row | null>(null);
  const [mergeModal, setMergeModal] = useState<{
    source: Row;
    targetId: string;
    message: string;
  } | null>(null);

  // WhatsApp test state
  const [testPhone, setTestPhone] = useState("+595982109823");
  const [testingWa, setTestingWa] = useState(false);
  const [waFeedback, setWaFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  async function handleSendWaTest(e: FormEvent) {
    e.preventDefault();
    setTestingWa(true);
    setWaFeedback(null);
    try {
      const r = await fetch("/api/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "whatsapp", to: testPhone }),
      });
      const data = await r.json();
      if (!r.ok) {
        throw new Error(data.error || "Falha no envio de teste do WhatsApp.");
      }
      setWaFeedback({
        ok: true,
        message: `Disparo realizado com sucesso! ID: ${data.messageId || "OK"}. Destinatário: ${data.to}.${data.warning ? " " + data.warning : ""}`,
      });
    } catch (err) {
      setWaFeedback({
        ok: false,
        message: err instanceof Error ? err.message : "Erro ao testar envio.",
      });
    } finally {
      setTestingWa(false);
    }
  }

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
        ? {
            name: d.name,
            whatsapp: d.whatsapp || "",
            consent: d.consent === "on",
          }
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

  async function handleSaveEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingItem) return;
    setBusy(true);
    setFeedback("");
    const f = e.currentTarget;
    const d = Object.fromEntries(new FormData(f));
    const endpoint = tab === "gates" ? "geofences" : tab;
    const body =
      tab === "clients"
        ? {
            name: d.name,
            whatsapp: d.whatsapp || "",
            consent: d.consent === "on",
          }
        : tab === "gates"
          ? {
              name: d.name,
              radiusM: Number(d.radiusM),
            }
          : {
              name: d.name,
              phone: d.phone || "",
              plate: d.plate || "",
            };
    try {
      const res = await fetch(`/api/${endpoint}/${editingItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok)
        throw new Error(result.error || "Não foi possível atualizar.");
      setFeedback("Cadastro atualizado com sucesso.");
      setEditingItem(null);
      await reload();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Erro ao atualizar.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(item: Row) {
    if (!window.confirm(`Deseja realmente excluir "${item.name}"?`)) return;
    setBusy(true);
    setFeedback("");
    const endpoint = tab === "gates" ? "geofences" : tab;
    try {
      const res = await fetch(`/api/${endpoint}/${item.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.canMerge) {
        setMergeModal({
          source: item,
          targetId: "",
          message: data.error,
        });
        return;
      }
      if (!res.ok) {
        throw new Error(data.error || "Não foi possível excluir.");
      }
      setFeedback(data.message || `"${item.name}" excluído com sucesso.`);
      if (editingItem?.id === item.id) setEditingItem(null);
      await reload();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Erro ao excluir.");
    } finally {
      setBusy(false);
    }
  }

  async function handleExecuteMerge(sourceId: string, targetId: string) {
    if (!targetId) return;
    setBusy(true);
    setFeedback("");
    const endpoint = tab === "gates" ? "geofences" : tab;
    try {
      const res = await fetch(
        `/api/${endpoint}/${sourceId}?mergeInto=${targetId}`,
        { method: "DELETE" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Não foi possível transferir e excluir.");
      }
      setFeedback("Fretes transferidos e duplicado excluído com sucesso.");
      setMergeModal(null);
      await reload();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Erro ao unificar.");
    } finally {
      setBusy(false);
    }
  }

  async function handleMergeCotripar(duplicates: Row[]) {
    if (
      !window.confirm(
        "Deseja unificar os cadastros da Cotripar em 'COTRIPAR S.A.', transferir todas as viagens e desvincular o número operacional do contato do cliente?",
      )
    )
      return;
    setBusy(true);
    setFeedback("");
    try {
      const canonical =
        duplicates.find((d) => d.name === "COTRIPAR S.A.") || duplicates[0];
      const others = duplicates.filter((d) => d.id !== canonical.id);

      for (const other of others) {
        const res = await fetch(
          `/api/clients/${other.id}?mergeInto=${canonical.id}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Erro ao mesclar cadastro.");
        }
      }

      // Desvincula o número de teste/operacional do cliente Cotripar
      const patchRes = await fetch(`/api/clients/${canonical.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "COTRIPAR S.A.",
          whatsapp: "",
          consent: false,
        }),
      });
      if (!patchRes.ok) {
        const err = await patchRes.json().catch(() => ({}));
        throw new Error(err.error || "Erro ao atualizar dados da Cotripar.");
      }

      setFeedback(
        "Cadastros da COTRIPAR unificados com sucesso em 'COTRIPAR S.A.'! O número +595982109823 atua exclusivamente como cópia operacional para todas as viagens.",
      );
      await reload();
    } catch (err) {
      setFeedback(
        err instanceof Error ? err.message : "Erro ao unificar cadastros.",
      );
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

  const cotriparDuplicates =
    tab === "clients"
      ? (lists.clients || []).filter((c) =>
          c.name.toUpperCase().replace(/[^A-Z]/g, "").includes("COTRIPAR"),
        )
      : [];

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
        <Link href="/importar">Importar documento</Link>
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
                  "Corpo sugerido: Olá {{1}}, container {{2}}: {{3}}. Destino: {{4}}. Previsão de chegada: {{5}}. Acompanhe: {{6}}."
                }
              </p>
            </li>
            <li>
              <b>3. Configure as variáveis na Vercel.</b>
              <div className="bg-slate-50 rounded-lg p-4 mt-2 text-xs space-y-2 font-mono break-all">
                {[
                  "WHATSAPP_PROVIDER=meta",
                  "META_WHATSAPP_TOKEN",
                  "META_WHATSAPP_PHONE_NUMBER_ID",
                  "META_WHATSAPP_DEPARTURE_TEMPLATE",
                  "META_GRAPH_VERSION",
                  "META_TEMPLATE_LANGUAGE=pt_BR",
                  "WHATSAPP_OPS_NUMBERS=+595982109823",
                ].map((x) => (
                  <p key={x}>{x}</p>
                ))}
              </div>
            </li>
            <li>
              <b>4. Cópia operacional fixa automática.</b>
              <p className="text-slate-500">
                O número <b>+595982109823</b> recebe automaticamente uma cópia
                operacional de todos os avisos de saída e checkpoints, além do
                contato individual do cliente.
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

          <div className="mt-8 pt-6 border-t">
            <h2 className="text-lg font-semibold mb-2">
              Disparo de Teste do WhatsApp
            </h2>
            <p className="text-sm text-slate-500 mb-4 leading-relaxed">
              Envie uma mensagem de teste para verificar se o token da Meta, o
              número remetente e o template estão configurados e aprovados.
            </p>
            <form onSubmit={handleSendWaTest} className="space-y-4 max-w-xl">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Telefone para teste (com DDI e DDD)
                </label>
                <input
                  type="tel"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="+595982109823"
                  className="w-full text-sm rounded border border-slate-300 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-xs text-slate-400 mt-1 block">
                  Número operacional pré-configurado: +595982109823.
                </span>
              </div>
              <button
                type="submit"
                disabled={testingWa}
                className="btn primary inline-flex items-center gap-2"
              >
                {testingWa ? "Enviando teste..." : "Enviar teste WhatsApp"}
              </button>
            </form>
            {waFeedback && (
              <div
                className={`mt-4 p-3 rounded-lg text-sm ${
                  waFeedback.ok
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-rose-50 text-rose-800 border border-rose-200"
                }`}
              >
                <b>{waFeedback.ok ? "✓ Sucesso: " : "✕ Erro: "}</b>
                {waFeedback.message}
              </div>
            )}
          </div>

          <div className="mt-8 pt-5 border-t">
            <h2>Rastreamento dos cavalos · GlobalSAT</h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              A MANU LOGISTICA acompanha os cavalos pelos rastreadores GlobalSAT
              instalados nos veículos. A associação é feita pela placa do cavalo
              vinculada ao frete, sem depender do celular do motorista.
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
                ? "Delimite a área do portão de saída de Paranaguá. Entrar registra espera; sair após confirmação do GPS gera o aviso."
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
                  {tab === "clients"
                    ? "WhatsApp do cliente (opcional)"
                    : "Telefone (opcional)"}
                  <input
                    name={tab === "clients" ? "whatsapp" : "phone"}
                    type="tel"
                    pattern="(?:\+[1-9][0-9]{7,14})?"
                    placeholder="+55… ou +595… (opcional)"
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
                <label>
                  Identificação do ponto
                  <input
                    name="name"
                    required
                    maxLength={120}
                    placeholder="Ex: Porto Paranaguá - Portão Principal"
                  />
                </label>
                <label>
                  Latitude
                  <input
                    name="latitude"
                    type="number"
                    step="any"
                    required
                    placeholder="-25.50…"
                  />
                </label>
                <label>
                  Longitude
                  <input
                    name="longitude"
                    type="number"
                    step="any"
                    required
                    placeholder="-48.51…"
                  />
                </label>
                <label>
                  Raio (metros)
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
                  <span className="flex justify-between items-center">
                    <span>Código do container ou carga</span>
                    <button
                      type="button"
                      className="text-xs text-blue-600 underline font-normal hover:text-blue-800"
                      onClick={(e) => {
                        const form = e.currentTarget.closest("form");
                        const input = form?.elements.namedItem(
                          "code",
                        ) as HTMLInputElement | null;
                        if (input)
                          input.value = `CS-${Date.now().toString().slice(-6)}`;
                      }}
                    >
                      Gerar Carga Solta
                    </button>
                  </span>
                  <input
                    name="code"
                    pattern="[A-Za-z0-9\-\.\/]{3,30}"
                    maxLength={30}
                    required
                    placeholder="Ex: MRSU2904847 ou CS-BR366200452"
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
                  Portão de saída · Paranaguá
                  <input
                    readOnly
                    value="Porto de Paranaguá · seleção automática"
                  />
                </label>
                <label>
                  Origem
                  <input
                    name="origin"
                    required
                    maxLength={160}
                    defaultValue="Porto de Paranaguá"
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
                <label>
                  Tempo previsto após a saída (horas)
                  <input
                    name="transitHours"
                    type="number"
                    required
                    min={1}
                    max={720}
                    placeholder="Inclua paradas e fronteira"
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
                frete por WhatsApp. Sem esta autorização, apenas a cópia
                operacional interna receberá os avisos.
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
          <div className="flex justify-between items-center mb-4">
            <h2>Cadastrados · {lists[tab].length}</h2>
          </div>

          {/* Banner de unificação da Cotripar */}
          {cotriparDuplicates.length > 1 && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div>
                <b className="text-amber-900 text-sm block">
                  Cadastros duplicados da COTRIPAR detectados:
                </b>
                <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                  Existem {cotriparDuplicates.length} registros (
                  {cotriparDuplicates.map((c) => `"${c.name}"`).join(" e ")}). O
                  número <b>+595982109823</b> é a linha de cópia operacional da
                  empresa e não o contato da Cotripar.
                </p>
              </div>
              <button
                type="button"
                className="btn primary text-xs whitespace-nowrap bg-amber-600 hover:bg-amber-700 text-white font-medium px-4 py-2 rounded-lg"
                onClick={() => handleMergeCotripar(cotriparDuplicates)}
                disabled={busy}
              >
                {busy ? "Unificando…" : "Unificar em COTRIPAR S.A."}
              </button>
            </div>
          )}

          {loading ? (
            <p className="text-slate-400">Carregando…</p>
          ) : lists[tab].length ? (
            <div className="space-y-3">
              {lists[tab].map((r) => {
                const isEditing = editingItem?.id === r.id;
                if (isEditing) {
                  return (
                    <article
                      key={r.id}
                      className="p-4 border-2 border-blue-400 bg-blue-50/20 rounded-xl space-y-3"
                    >
                      <div className="flex justify-between items-center">
                        <b className="text-sm font-semibold text-blue-900">
                          Editar Cadastro
                        </b>
                        <button
                          type="button"
                          onClick={() => setEditingItem(null)}
                          className="text-slate-400 hover:text-slate-600 p-1"
                          title="Cancelar"
                        >
                          <X size={18} />
                        </button>
                      </div>
                      <form onSubmit={handleSaveEdit} className="space-y-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Nome
                          </label>
                          <input
                            name="name"
                            defaultValue={r.name}
                            required
                            className="w-full text-sm rounded border border-slate-300 p-2"
                          />
                        </div>
                        {tab === "clients" && (
                          <>
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1">
                                WhatsApp do cliente (opcional)
                              </label>
                              <input
                                name="whatsapp"
                                defaultValue={r.whatsapp || ""}
                                placeholder="+55… ou +595… (opcional)"
                                className="w-full text-sm rounded border border-slate-300 p-2"
                              />
                              <span className="text-xs text-slate-500 mt-1 block">
                                Se vazio, os avisos irão apenas para o número
                                operacional da empresa.
                              </span>
                            </div>
                            <label className="flex gap-2 items-center text-xs text-slate-600">
                              <input
                                type="checkbox"
                                name="consent"
                                defaultChecked={r.consent}
                              />
                              Cliente autorizou avisos por WhatsApp
                            </label>
                          </>
                        )}
                        {tab === "drivers" && (
                          <>
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1">
                                Telefone (opcional)
                              </label>
                              <input
                                name="phone"
                                defaultValue={r.phone || ""}
                                placeholder="+55… ou +595…"
                                className="w-full text-sm rounded border border-slate-300 p-2"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1">
                                Placa do veículo
                              </label>
                              <input
                                name="plate"
                                defaultValue={r.plate || ""}
                                placeholder="Ex: ABC1234"
                                className="w-full text-sm rounded border border-slate-300 p-2"
                              />
                            </div>
                          </>
                        )}
                        {tab === "gates" && (
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              Raio (metros)
                            </label>
                            <input
                              name="radiusM"
                              type="number"
                              defaultValue={r.radiusM ?? 300}
                              min={50}
                              max={2000}
                              className="w-full text-sm rounded border border-slate-300 p-2"
                            />
                          </div>
                        )}
                        <div className="flex gap-2 pt-2">
                          <button
                            type="submit"
                            disabled={busy}
                            className="btn primary text-xs"
                          >
                            {busy ? "Salvando…" : "Salvar alterações"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingItem(null)}
                            className="btn secondary text-xs"
                          >
                            Cancelar
                          </button>
                        </div>
                      </form>
                    </article>
                  );
                }

                return (
                  <article
                    key={r.id}
                    className="flex items-center justify-between p-3 border rounded-xl hover:border-slate-300 transition-colors"
                  >
                    <div>
                      <b>{r.name}</b>
                      <small className="text-slate-500 block text-xs mt-0.5">
                        {tab === "clients"
                          ? r.whatsapp
                            ? r.whatsapp
                            : "Sem WhatsApp direto (cópia operacional ativa)"
                          : tab === "drivers"
                            ? [r.phone || "Sem telefone", r.plate]
                                .filter(Boolean)
                                .join(" · ")
                            : tab === "gates"
                              ? `${r.radiusM ?? 300} m de raio`
                              : ""}
                      </small>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingItem(r)}
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Editar"
                      >
                        <Pencil size={17} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(r)}
                        className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Excluir"
                      >
                        <Trash size={17} />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              Nenhum registro ainda. Preencha o formulário acima.
            </p>
          )}
        </section>
      )}

      {/* Modal de confirmação de unificação quando fretes estão vinculados */}
      {mergeModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-semibold text-slate-900">
                Unificar ou Transferir Fretes
              </h3>
              <button
                type="button"
                onClick={() => setMergeModal(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-amber-800 bg-amber-50 p-3 rounded-lg border border-amber-200 leading-relaxed">
              {mergeModal.message}
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Transferir fretes vinculados a &quot;{mergeModal.source.name}&quot; para:
              </label>
              <select
                value={mergeModal.targetId}
                onChange={(e) =>
                  setMergeModal({ ...mergeModal, targetId: e.target.value })
                }
                className="w-full text-sm rounded border border-slate-300 p-2"
              >
                <option value="" disabled>
                  Selecione o cadastro de destino…
                </option>
                {lists[tab]
                  ?.filter((item) => item.id !== mergeModal.source.id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMergeModal(null)}
                className="btn secondary text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!mergeModal.targetId || busy}
                onClick={() =>
                  handleExecuteMerge(mergeModal.source.id, mergeModal.targetId)
                }
                className="btn primary text-xs"
              >
                {busy ? "Transferindo…" : "Transferir e Excluir Duplicado"}
              </button>
            </div>
          </div>
        </div>
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
