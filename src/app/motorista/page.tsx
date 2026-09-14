"use client";
import { useEffect, useRef, useState } from "react";
import {
  Truck,
  MapPin,
  NavigationArrow,
  Stop,
  Play,
  ArrowLeft,
} from "@phosphor-icons/react";
import Link from "next/link";
import { watchPosition, WatchHandle } from "@/lib/location-client";
import { STATUS_LABELS, ContainerStatus } from "@/lib/status";
type Trip = {
  id: string;
  code: string;
  driver: string;
  origin: string;
  destination: string;
  status: string;
  gate: { name: string; radiusM: number } | null;
};
export default function Driver() {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [error, setError] = useState("");
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [consent, setConsent] = useState(false);
  const [last, setLast] = useState("");
  const [accuracy, setAccuracy] = useState<number>();
  const [token, setToken] = useState("");
  const handle = useRef<WatchHandle | null>(null);
  const alive = useRef(true);
  const lastSent = useRef(0);
  const sending = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    const generationRef = generation;
    alive.current = true;
    const t =
      new URLSearchParams(location.hash.slice(1)).get("token") ||
      sessionStorage.getItem("fretes-driver-token") ||
      "";
    if (t) {
      sessionStorage.setItem("fretes-driver-token", t);
      history.replaceState(null, "", location.pathname);
      setToken(t);
      fetch("/api/tracking", { headers: { Authorization: "Bearer " + t } })
        .then(async (r) => {
          const p = await r.json();
          if (!r.ok) throw new Error(p.error);
          if (alive.current) setTrip(p);
        })
        .catch((e) => {
          if (alive.current) setError(e.message);
        });
    } else
      setError(
        "Abra o link privado de rastreamento fornecido pela transportadora.",
      );
    return () => {
      alive.current = false;
      generationRef.current++;
      handle.current?.clear();
    };
  }, []);
  function stop() {
    generation.current++;
    handle.current?.clear();
    handle.current = null;
    setActive(false);
    setStarting(false);
  }
  async function start() {
    if (!consent) return;
    setStarting(true);
    setError("");
    const current = ++generation.current;
    try {
      const h = await watchPosition(
        async (fix) => {
          if (
            !alive.current ||
            generation.current !== current ||
            sending.current ||
            Date.now() - lastSent.current < 15000
          )
            return;
          sending.current = true;
          lastSent.current = Date.now();
          setAccuracy(fix.accuracyM);
          try {
            const r = await fetch("/api/positions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer " + token,
              },
              body: JSON.stringify(fix),
            });
            const p = await r.json();
            if (!r.ok)
              throw new Error(p.error || "Não foi possível enviar a posição.");
            if (!alive.current) return;
            setError("");
            setLast(new Date().toLocaleTimeString("pt-BR"));
            if (p.triggers?.length) {
              const status = p.triggers[p.triggers.length - 1].status;
              setTrip((t) => (t ? { ...t, status } : t));
              if (status === "A_CAMINHO_DESTINO") stop();
            }
          } catch (e) {
            if (alive.current)
              setError(
                e instanceof Error
                  ? e.message
                  : "Falha de conexão. Nova tentativa na próxima posição.",
              );
          } finally {
            sending.current = false;
          }
        },
        (message) => {
          if (alive.current) {
            setError(message);
            stop();
          }
        },
      );
      if (!alive.current || generation.current !== current) {
        h.clear();
        return;
      }
      handle.current = h;
      setActive(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível ativar o GPS.",
      );
    } finally {
      if (alive.current) setStarting(false);
    }
  }
  return (
    <main className="driver-page">
      <Link href="/login" className="brand">
        <span className="brand-mark">
          <Truck size={24} />
        </span>
        AXIS / fretes
      </Link>
      <section className="panel driver-card">
        <div className="eyebrow">ÁREA DO MOTORISTA</div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Seu próximo destino.
        </h1>
        <p className="text-slate-500 text-sm mt-2">
          {trip
            ? "Olá, " + trip.driver + ". Acompanhe seu frete."
            : "Acesso individual e seguro ao rastreamento."}
        </p>
        {trip && (
          <>
            <div className="bg-slate-50 rounded-lg p-4 my-6">
              <b className="text-lg">{trip.code}</b>
              <p className="text-sm mt-2">
                {trip.origin} → {trip.destination}
              </p>
              <p className="text-xs text-emerald-700 mt-3">
                {STATUS_LABELS[trip.status as ContainerStatus]}
              </p>
            </div>
            <div className={"tracking-orb " + (active ? "running" : "")}>
              <span>
                <NavigationArrow
                  size={42}
                  weight={active ? "fill" : "regular"}
                />
              </span>
            </div>
            <h2 className="text-center">
              {active
                ? "GPS ativo"
                : trip.status === "A_CAMINHO_DESTINO"
                  ? "Saída registrada"
                  : trip.status === "CHEGADA_PORTAO"
                    ? "Chegada registrada"
                    : "Pronto para iniciar"}
            </h2>
            <p className="text-center text-xs text-slate-400 mt-2">
              {last
                ? "Última posição enviada às " + last
                : "A localização só é compartilhada após sua autorização."}
              {accuracy !== undefined &&
                " · precisão " + Math.round(accuracy) + " m"}
            </p>
            <div className="flex items-start gap-3 border-y border-slate-100 my-6 py-4">
              <MapPin size={22} />
              <div>
                <b className="text-sm">
                  {trip.gate?.name || "Portão não configurado"}
                </b>
                <p className="text-xs text-slate-500">
                  {trip.gate?.radiusM} m de raio para registrar entrada e saída.
                </p>
              </div>
            </div>
            <label className="flex gap-3 items-start mb-5">
              <input
                type="checkbox"
                checked={consent}
                disabled={active}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span className="text-xs text-slate-500">
                Autorizo compartilhar minha localização com a transportadora
                durante este frete para registrar entrada e saída do portão.
              </span>
            </label>
            {active ? (
              <button
                className="btn secondary w-full justify-center"
                onClick={stop}
              >
                <Stop size={18} />
                Parar rastreamento
              </button>
            ) : (
              <button
                className="btn primary w-full justify-center"
                disabled={!consent || starting || trip.status !== "EM_TRANSITO"}
                onClick={start}
              >
                <Play size={18} />
                {starting ? "Solicitando GPS…" : "Iniciar rastreamento"}
              </button>
            )}
            <p className="feedback">
              No navegador, mantenha esta página aberta e a tela ligada. O
              rastreamento pode ser interrompido ao bloquear o celular ou trocar
              de aplicativo.
            </p>
          </>
        )}
        {error && (
          <p role="alert" className="feedback">
            {error}
          </p>
        )}
      </section>
      <Link
        href="/login"
        className="flex items-center gap-2 text-xs text-slate-400 mt-6"
      >
        <ArrowLeft size={14} />
        Acesso da transportadora
      </Link>
    </main>
  );
}
