"use client";

import { useEffect } from "react";
import Link from "next/link";
import {
  X,
  ClockCounterClockwise,
  Package,
  FilePdf,
  CheckCircle,
  Truck,
  ArrowRight,
  Plus,
} from "@phosphor-icons/react";
import type { FleetVehicle } from "@/lib/fleet";

interface FleetHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  truck: FleetVehicle | null;
}

const formatDate = (dateStr?: string | null) => {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
  } catch {
    return dateStr;
  }
};

export default function FleetHistoryDrawer({
  isOpen,
  onClose,
  truck,
}: FleetHistoryDrawerProps) {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !truck) return null;

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="fleet-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="p-6 border-b border-slate-100 flex items-start justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center font-bold border border-amber-400/30 shadow-xs">
              <Truck size={22} weight="fill" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="drawer-title" className="text-xl font-bold text-slate-800">
                  Cavalo {truck.plate}
                </h2>
                <span className="badge entregue text-xs">
                  <span />
                  {truck.statusLabel}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {truck.driver?.name
                  ? `Motorista: ${truck.driver.name} · ${truck.totalTripsCompleted} frete(s) entregue(s)`
                  : `${truck.totalTripsCompleted} frete(s) entregue(s)`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 transition"
            aria-label="Fechar histórico"
          >
            <X size={20} />
          </button>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Active Freight Callout if on road */}
          {truck.activeFreight && (
            <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/60">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  Frete em Andamento
                </span>
                <span className="badge a_caminho_destino text-xs">
                  {truck.activeFreight.status}
                </span>
              </div>
              <b className="text-base font-semibold text-slate-800 block">
                {truck.activeFreight.code}
              </b>
              <p className="text-xs text-slate-600 mt-1">
                {truck.activeFreight.origin || "Origem"} →{" "}
                <b>{truck.activeFreight.destination || "Destino"}</b>
              </p>
              <div className="mt-3 flex items-center gap-3 pt-3 border-t border-amber-200/80 text-xs">
                {truck.activeFreight.document ? (
                  <a
                    href={`/api/documents/${truck.activeFreight.document.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn primary py-1.5 px-3 text-xs flex items-center gap-1.5"
                  >
                    <FilePdf size={16} />
                    Ver Documento Ativo
                  </a>
                ) : (
                  <span className="text-slate-400 text-xs">Sem documento anexado</span>
                )}
              </div>
            </div>
          )}

          {/* Past Trips Timeline */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <ClockCounterClockwise size={15} />
                Histórico de Viagens Concluídas
              </h3>
              <span className="text-xs text-slate-400 font-mono">
                {truck.tripHistory.length} registros
              </span>
            </div>

            {truck.tripHistory.length === 0 ? (
              <div className="text-center py-12 px-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
                <CheckCircle size={32} className="mx-auto text-slate-300 mb-2" />
                <p className="text-sm font-medium text-slate-600">
                  Nenhum frete concluído anteriormente
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  As viagens finalizadas deste caminhão aparecerão listadas aqui com seus documentos.
                </p>
              </div>
            ) : (
              <div className="space-y-3.5">
                {truck.tripHistory.map((trip) => (
                  <div
                    key={trip.id}
                    className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center font-bold">
                          <Package size={17} />
                        </span>
                        <div>
                          <b className="text-sm text-slate-800 tracking-wide">
                            {trip.code}
                          </b>
                          {trip.clientName && (
                            <small className="block text-slate-500 text-xs">
                              Cliente: {trip.clientName}
                            </small>
                          )}
                        </div>
                      </div>
                      <span className="badge entregue text-xs">
                        <span />
                        Entregue
                      </span>
                    </div>

                    {/* Route */}
                    <div className="mt-3 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg flex items-center gap-2">
                      <span className="truncate max-w-[150px]">
                        {trip.origin || "Porto"}
                      </span>
                      <ArrowRight size={13} className="text-slate-400 shrink-0" />
                      <b className="truncate text-slate-700">
                        {trip.destination || "Destino"}
                      </b>
                    </div>

                    {/* Tax & Trailer Info */}
                    <div className="grid grid-cols-2 gap-2 mt-2.5 text-xs text-slate-500 pt-2 border-t border-slate-100">
                      <div>
                        <span className="block text-slate-400">CRT / MIC-DTA</span>
                        <span className="font-mono text-slate-700">
                          {trip.crt || trip.micDta
                            ? `${trip.crt || "—"} / ${trip.micDta || "—"}`
                            : "Não informado"}
                        </span>
                      </div>
                      <div>
                        <span className="block text-slate-400">Data de Entrega</span>
                        <span className="text-slate-700">
                          {formatDate(trip.updatedAt)}
                        </span>
                      </div>
                    </div>

                    {/* Document Download Link */}
                    {trip.document ? (
                      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-xs text-slate-500 truncate max-w-[200px]">
                          📄 {trip.document.filename}
                        </span>
                        <a
                          href={`/api/documents/${trip.document.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn secondary text-xs py-1 px-3 flex items-center gap-1.5"
                        >
                          <FilePdf size={15} className="text-red-600" />
                          Baixar PDF
                        </a>
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-slate-400 italic">
                        Documento original não anexado
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Caminhão {truck.plate} · {truck.statusLabel}
          </span>
          <Link
            href={`/cadastro?tab=containers&truckPlate=${truck.plate}`}
            className="btn primary text-xs py-2 px-3.5 flex items-center gap-1.5"
          >
            <Plus size={15} />
            Novo frete para este caminhão
          </Link>
        </div>
      </aside>
    </div>
  );
}

