"use client";
import { useEffect, useState } from "react";
import { STATUS_LABELS, ContainerStatus } from "@/lib/status";
type Trip = {
  code: string;
  status: string;
  origin: string | null;
  destination: string | null;
  gateEnteredAt: string | null;
  departedAt: string | null;
  estimatedArrivalAt: string | null;
  updatedAt: string;
};
const format = (v: string) =>
  new Date(v).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
export default function Tracking() {
  const [trip, setTrip] = useState<Trip | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const hash = location.hash.slice(1),
      token = hash || sessionStorage.getItem("fretes-customer-token") || "";
    if (hash) {
      sessionStorage.setItem("fretes-customer-token", hash);
      history.replaceState(null, "", location.pathname);
    }
    const controller = new AbortController();
    async function refresh() {
      try {
        const r = await fetch("/api/customer-tracking", {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!r.ok) {
          setTrip(null);
          throw new Error(
            "Link inválido ou expirado. Solicite um novo link à transportadora.",
          );
        }
        setTrip(await r.json());
        setError("");
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : "Não foi possível atualizar.",
          );
      }
    }
    void refresh();
    const timer = setInterval(refresh, 30000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);
  return (
    <main className="max-w-2xl mx-auto px-5 py-12">
      <p className="eyebrow">AXIS FRETES · ACOMPANHAMENTO</p>
      <h1 className="text-3xl font-semibold mt-3">
        Sua carga, etapa por etapa
      </h1>
      {error && (
        <p role="status" className="feedback">
          {error}
        </p>
      )}
      {!trip && !error && <p className="mt-6">Carregando viagem…</p>}
      {trip && (
        <>
          <section className="panel p-6 mt-8">
            <p className="text-sm text-slate-500">Container</p>
            <h2 className="text-2xl font-semibold">{trip.code}</h2>
            <p className="mt-3">
              {trip.origin || "Porto de Paranaguá"} →{" "}
              {trip.destination || "Destino a confirmar"}
            </p>
            <p className="mt-4 font-semibold text-emerald-800">
              {STATUS_LABELS[trip.status as ContainerStatus] || trip.status}
            </p>
          </section>
          <section className="panel p-6 mt-5">
            <h2 className="font-semibold">Previsão de chegada</h2>
            <p className="text-xl mt-2">
              {trip.status === "ENTREGUE"
                ? "Entrega concluída"
                : trip.estimatedArrivalAt
                  ? format(trip.estimatedArrivalAt)
                  : "Será informada após a saída do porto"}
            </p>
            <p className="text-sm text-slate-500 mt-3">
              Horário de Brasília. Estimativa informada pela transportadora,
              sujeita a trânsito, paradas e procedimentos de fronteira.
            </p>
            {trip.status !== "ENTREGUE" &&
              trip.estimatedArrivalAt &&
              new Date(trip.estimatedArrivalAt) < new Date() && (
                <p className="feedback">
                  A previsão anterior passou. Aguarde a atualização da
                  transportadora.
                </p>
              )}
          </section>
          <ol className="panel p-6 mt-5 space-y-6">
            {[
              ["Viagem cadastrada", true, null],
              [
                "No portão de saída · aguardando liberação",
                !!trip.gateEnteredAt,
                trip.gateEnteredAt,
              ],
              [
                "Saiu do porto · a caminho do destino",
                !!trip.departedAt,
                trip.departedAt,
              ],
              [
                "Entrega concluída",
                trip.status === "ENTREGUE",
                null,
              ],
            ].map(([label, done, time]) => (
              <li
                key={String(label)}
                className={done ? "text-emerald-800" : "text-slate-400"}
              >
                <b>
                  {done ? "✓" : "○"} {label}
                </b>
                {time && <p className="text-sm ml-5">{format(String(time))}</p>}
              </li>
            ))}
          </ol>
          <p className="text-xs text-slate-500 mt-5">
            Última atualização da viagem: {format(trip.updatedAt)}. Esta página
            consulta novas atualizações a cada 30 segundos.
          </p>
        </>
      )}
    </main>
  );
}
