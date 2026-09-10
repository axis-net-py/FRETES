"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Fix, WatchHandle, watchPosition } from "@/lib/location-client";
import { STATUS_LABELS, ContainerStatus } from "@/lib/status";

type Driver = { id: string; name: string };
type Container = { id: string; code: string; driverId: string | null; status: string };
type Trigger = { geofenceName: string; containerCode: string; status: string; notified: boolean };

const MIN_INTERVAL_MS = 15000;

export default function DriverPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [containers, setContainers] = useState<Container[]>([]);
  const [driverId, setDriverId] = useState("");
  const [containerId, setContainerId] = useState("");
  const [tracking, setTracking] = useState(false);
  const [fix, setFix] = useState<Fix | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState("");

  const watchRef = useRef<WatchHandle | null>(null);
  const lastSentRef = useRef(0);

  useEffect(() => {
    Promise.all([
      fetch("/api/drivers").then((res) => res.json()),
      fetch("/api/containers").then((res) => res.json()),
    ])
      .then(([driverList, containerList]) => {
        setDrivers(driverList);
        setContainers(containerList);
      })
      .catch(() => setError("Não foi possível carregar motoristas e containers"));
  }, []);

  const pushLog = useCallback((line: string) => {
    setLog((current) => [`${new Date().toLocaleTimeString("pt-BR")} · ${line}`, ...current].slice(0, 20));
  }, []);

  const sendFix = useCallback(
    async (position: Fix) => {
      const response = await fetch("/api/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId, containerId: containerId || undefined, ...position }),
      });

      if (!response.ok) {
        pushLog("Falha ao enviar posição");
        return;
      }

      const data = (await response.json()) as { triggers: Trigger[] };
      for (const trigger of data.triggers) {
        pushLog(
          `${trigger.containerCode} entrou em ${trigger.geofenceName} → ${
            STATUS_LABELS[trigger.status as ContainerStatus] ?? trigger.status
          } · WhatsApp ${trigger.notified ? "enviado" : "falhou"}`,
        );
      }
    },
    [containerId, driverId, pushLog],
  );

  const stop = useCallback(() => {
    watchRef.current?.clear();
    watchRef.current = null;
    setTracking(false);
  }, []);

  const start = useCallback(async () => {
    if (!driverId) {
      setError("Selecione o motorista");
      return;
    }
    setError("");
    setTracking(true);
    pushLog("Rastreamento iniciado");

    watchRef.current = await watchPosition(
      (position) => {
        setFix(position);
        const now = Date.now();
        if (now - lastSentRef.current < MIN_INTERVAL_MS) return;
        lastSentRef.current = now;
        void sendFix(position);
      },
      (message) => {
        setError(message);
        stop();
      },
    );
  }, [driverId, pushLog, sendFix, stop]);

  useEffect(() => () => watchRef.current?.clear(), []);

  const driverContainers = containers.filter(
    (container) => !driverId || container.driverId === driverId,
  );

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Modo motorista</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="text-slate-300">Motorista</span>
          <select
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2"
            value={driverId}
            onChange={(event) => setDriverId(event.target.value)}
            disabled={tracking}
          >
            <option value="">Selecione…</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="text-slate-300">Container (opcional)</span>
          <select
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2"
            value={containerId}
            onChange={(event) => setContainerId(event.target.value)}
            disabled={tracking}
          >
            <option value="">Todos do motorista</option>
            {driverContainers.map((container) => (
              <option key={container.id} value={container.id}>
                {container.code}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button
        type="button"
        onClick={tracking ? stop : start}
        className={`rounded px-4 py-2 font-medium ${
          tracking ? "bg-red-600 hover:bg-red-500" : "bg-sky-600 hover:bg-sky-500"
        }`}
      >
        {tracking ? "Parar rastreamento" : "Iniciar rastreamento"}
      </button>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {fix && (
        <p className="text-sm text-slate-300">
          Última posição: {fix.latitude.toFixed(6)}, {fix.longitude.toFixed(6)}
          {fix.accuracyM ? ` (±${Math.round(fix.accuracyM)} m)` : ""}
        </p>
      )}

      <section>
        <h2 className="mb-2 text-lg font-semibold">Eventos</h2>
        <ul className="space-y-1 text-sm text-slate-300">
          {log.length === 0 ? <li className="text-slate-500">Sem eventos ainda.</li> : null}
          {log.map((line) => (
            <li key={line} className="rounded border border-slate-800 px-3 py-1">
              {line}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
