"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { CONTAINER_STATUSES, ContainerStatus, STATUS_LABELS } from "@/lib/status";

type Option = { id: string; name: string };

const inputClass = "w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm";
const buttonClass = "rounded bg-sky-600 px-4 py-2 text-sm font-medium hover:bg-sky-500";
const cardClass = "space-y-3 rounded-lg border border-slate-800 p-4";

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error((await response.text()) || "Erro ao salvar");
  return response.json();
}

export default function CadastroPage() {
  const [clients, setClients] = useState<Option[]>([]);
  const [drivers, setDrivers] = useState<Option[]>([]);
  const [feedback, setFeedback] = useState("");

  const reload = useCallback(() => {
    Promise.all([
      fetch("/api/clients").then((res) => res.json()),
      fetch("/api/drivers").then((res) => res.json()),
    ]).then(([clientList, driverList]) => {
      setClients(clientList);
      setDrivers(driverList);
    });
  }, []);

  useEffect(reload, [reload]);

  const submit = (url: string, transform: (form: FormData) => unknown) =>
    async function handle(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      const form = event.currentTarget;
      try {
        await postJson(url, transform(new FormData(form)));
        form.reset();
        setFeedback("Salvo com sucesso");
        reload();
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : "Erro ao salvar");
      }
    };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Cadastro</h1>
      {feedback && <p className="text-sm text-slate-300">{feedback}</p>}

      <form
        className={cardClass}
        onSubmit={submit("/api/clients", (form) => ({
          name: String(form.get("name")),
          whatsapp: String(form.get("whatsapp")),
        }))}
      >
        <h2 className="font-medium">Cliente</h2>
        <input name="name" className={inputClass} placeholder="Nome do cliente" required />
        <input
          name="whatsapp"
          className={inputClass}
          placeholder="WhatsApp (ex: 11987654321)"
          required
        />
        <button className={buttonClass}>Salvar cliente</button>
      </form>

      <form
        className={cardClass}
        onSubmit={submit("/api/drivers", (form) => ({
          name: String(form.get("name")),
          phone: String(form.get("phone")),
        }))}
      >
        <h2 className="font-medium">Motorista</h2>
        <input name="name" className={inputClass} placeholder="Nome do motorista" required />
        <input name="phone" className={inputClass} placeholder="Telefone" required />
        <button className={buttonClass}>Salvar motorista</button>
      </form>

      <form
        className={cardClass}
        onSubmit={submit("/api/containers", (form) => ({
          code: String(form.get("code")),
          clientId: String(form.get("clientId")),
          driverId: String(form.get("driverId")) || undefined,
          origin: String(form.get("origin")) || undefined,
          destination: String(form.get("destination")) || undefined,
        }))}
      >
        <h2 className="font-medium">Container</h2>
        <input name="code" className={inputClass} placeholder="Código do container" required />
        <select name="clientId" className={inputClass} required defaultValue="">
          <option value="" disabled>
            Cliente…
          </option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
        <select name="driverId" className={inputClass} defaultValue="">
          <option value="">Motorista (opcional)…</option>
          {drivers.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driver.name}
            </option>
          ))}
        </select>
        <input name="origin" className={inputClass} placeholder="Origem" />
        <input name="destination" className={inputClass} placeholder="Destino" />
        <button className={buttonClass}>Salvar container</button>
      </form>

      <form
        className={cardClass}
        onSubmit={submit("/api/geofences", (form) => ({
          name: String(form.get("name")),
          latitude: Number(form.get("latitude")),
          longitude: Number(form.get("longitude")),
          radiusM: Number(form.get("radiusM")),
          status: String(form.get("status")) as ContainerStatus,
        }))}
      >
        <h2 className="font-medium">Geofence (portão de liberação)</h2>
        <input name="name" className={inputClass} placeholder="Nome (ex: Portão Tecon Santos)" required />
        <div className="grid gap-3 sm:grid-cols-3">
          <input
            name="latitude"
            className={inputClass}
            placeholder="Latitude"
            type="number"
            step="any"
            required
          />
          <input
            name="longitude"
            className={inputClass}
            placeholder="Longitude"
            type="number"
            step="any"
            required
          />
          <input
            name="radiusM"
            className={inputClass}
            placeholder="Raio (m)"
            type="number"
            defaultValue={300}
            min={30}
            required
          />
        </div>
        <select name="status" className={inputClass} defaultValue="CHEGADA_PORTAO">
          {CONTAINER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>
        <button className={buttonClass}>Salvar geofence</button>
      </form>
    </div>
  );
}
