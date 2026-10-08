"use client";

import { useEffect, useRef, useState } from "react";
import {
  X,
  ArrowSquareOut,
  Clock,
  Truck,
} from "@phosphor-icons/react";
import type { FleetVehicle } from "@/lib/fleet";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";

type TrailData = {
  truckPlate: string;
  driver: { name: string; phone: string } | null;
  container: {
    code: string;
    status: string;
    origin: string | null;
    destination: string | null;
  } | null;
  current: {
    latitude: number;
    longitude: number;
    recordedAt: string;
    source: string;
  } | null;
  trail: Array<{
    latitude: number;
    longitude: number;
    recordedAt: string;
  }>;
  origin: {
    name: string;
    latitude: number;
    longitude: number;
    radiusM?: number;
  };
  destination: {
    name: string;
    latitude: number | null;
    longitude: number | null;
    radiusM?: number | null;
  } | null;
};

interface FleetMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: "single" | "all";
  truck?: FleetVehicle | null;
  allTrucks?: FleetVehicle[];
  onSelectTruck?: (truck: FleetVehicle) => void;
}

export default function FleetMapModal({
  isOpen,
  onClose,
  mode,
  truck,
  allTrucks = [],
  onSelectTruck,
}: FleetMapModalProps) {
  void onSelectTruck;
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  const [trailData, setTrailData] = useState<TrailData | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch trail when in single truck mode
  useEffect(() => {
    if (!isOpen || mode !== "single" || !truck) {
      setTrailData(null);
      return;
    }

    let active = true;
    setLoading(true);

    fetch(`/api/fleet/${truck.plate}/trail`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data) {
          setTrailData(data);
        }
      })
      .catch((err) => {
        console.error("Failed to load trail:", err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, mode, truck]);

  // Initialize and update Leaflet map
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    let isSubscribed = true;

    // Dynamically import Leaflet
    import("leaflet").then((L) => {
      if (!isSubscribed || !mapContainerRef.current) return;

      // Clean up previous map if exists
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      // Default center: Paraná / Paraguay border (-25.3, -53.5)
      const map = L.map(mapContainerRef.current, {
        zoomControl: true,
      }).setView([-25.3, -53.5], 7);

      mapInstanceRef.current = map;

      // High-performance logistics map tiles via CARTO Voyager with AXIS official API key
      const cartoKey =
        process.env.NEXT_PUBLIC_CARTO_API_KEY ||
        "cb1_4ebu_1_4f459222772039164e892304";
      L.tileLayer(
        `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${cartoKey}`,
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: "abcd",
          maxZoom: 20,
        },
      ).addTo(map);

      // Force recalculation of container size after modal entrance animation
      const scheduleResize = (delay: number) => {
        setTimeout(() => {
          if (isSubscribed && mapInstanceRef.current) {
            mapInstanceRef.current.invalidateSize();
          }
        }, delay);
      };
      scheduleResize(50);
      scheduleResize(200);
      scheduleResize(500);

      const bounds = L.latLngBounds([]);

      if (mode === "single" && truck) {
        const curLat = trailData?.current?.latitude ?? truck.lastPosition?.latitude;
        const curLng = trailData?.current?.longitude ?? truck.lastPosition?.longitude;

        // 1. Draw trail polyline if available
        if (trailData?.trail && trailData.trail.length > 1) {
          const latLngs = trailData.trail.map(
            (p) => [p.latitude, p.longitude] as [number, number],
          );
          L.polyline(latLngs, {
            color: "#1d6f54",
            weight: 5,
            opacity: 0.85,
            lineJoin: "round",
          }).addTo(map);

          latLngs.forEach((coord) => bounds.extend(coord));
        }

        // 2. Add Truck Marker
        if (curLat && curLng) {
          bounds.extend([curLat, curLng]);

          const truckIconHtml = `
            <div style="background: #205e4b; color: white; padding: 4px 8px; border-radius: 6px; font-weight: bold; font-size: 11px; box-shadow: 0 3px 8px rgba(0,0,0,0.35); border: 2px solid white; display: flex; align-items: center; gap: 5px; white-space: nowrap; transform: translate(-50%, -50%);">
              <span>🚚</span>
              <span>${truck.plate}</span>
            </div>
          `;

          const truckIcon = L.divIcon({
            className: "custom-truck-pin",
            html: truckIconHtml,
            iconSize: [0, 0],
          });

          const marker = L.marker([curLat, curLng], { icon: truckIcon }).addTo(map);

          const timeLabel = truck.lastPosition?.healthLabel || "Sinal recente";
          const popupContent = `
            <div style="padding: 4px; font-family: inherit;">
              <b style="font-size: 14px; color: #205e4b;">Cavalo ${truck.plate}</b>
              <p style="margin: 4px 0; font-size: 12px; color: #475569;">
                Motorista: <b>${truck.driver?.name || "Não informado"}</b>
              </p>
              ${
                truck.activeFreight
                  ? `<p style="margin: 4px 0; font-size: 12px;">Container: <b>${truck.activeFreight.code}</b></p>`
                  : ""
              }
              <p style="margin: 4px 0; font-size: 11px; color: #64748b;">
                ${timeLabel}
              </p>
            </div>
          `;
          marker.bindPopup(popupContent).openPopup();
        }

        // 3. Add Destination Marker if known
        if (
          trailData?.destination &&
          trailData.destination.latitude &&
          trailData.destination.longitude
        ) {
          const destLat = trailData.destination.latitude;
          const destLng = trailData.destination.longitude;
          bounds.extend([destLat, destLng]);

          const destIconHtml = `
            <div style="background: #b91c1c; color: white; padding: 4px 7px; border-radius: 6px; font-weight: bold; font-size: 10px; box-shadow: 0 3px 6px rgba(0,0,0,0.3); border: 2px solid white; display: flex; align-items: center; gap: 4px; white-space: nowrap; transform: translate(-50%, -50%);">
              <span>📍</span>
              <span>${trailData.destination.name.split("-")[0].trim()}</span>
            </div>
          `;

          const destIcon = L.divIcon({
            className: "custom-dest-pin",
            html: destIconHtml,
            iconSize: [0, 0],
          });

          L.marker([destLat, destLng], { icon: destIcon })
            .addTo(map)
            .bindPopup(`<b>Destino Final</b><br/>${trailData.destination.name}`);

          if (trailData.destination.radiusM) {
            L.circle([destLat, destLng], {
              radius: trailData.destination.radiusM,
              color: "#b91c1c",
              fillColor: "#ef4444",
              fillOpacity: 0.15,
            }).addTo(map);
          }
        }

        // Fit map bounds
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
        } else if (curLat && curLng) {
          map.setView([curLat, curLng], 14);
        }
      } else if (mode === "all") {
        // Mode ALL: plot all trucks with positions
        allTrucks.forEach((t) => {
          if (!t.lastPosition?.latitude || !t.lastPosition?.longitude) return;

          const lat = t.lastPosition.latitude;
          const lng = t.lastPosition.longitude;
          bounds.extend([lat, lng]);

          const statusBg =
            t.status === "EM_VIAGEM"
              ? "#166534"
              : t.status === "NO_PORTO"
                ? "#b45309"
                : "#1d4ed8";

          const iconHtml = `
            <div style="background: ${statusBg}; color: white; padding: 4px 8px; border-radius: 6px; font-weight: bold; font-size: 11px; box-shadow: 0 3px 6px rgba(0,0,0,0.3); border: 2px solid white; display: flex; align-items: center; gap: 5px; white-space: nowrap; transform: translate(-50%, -50%); cursor: pointer;">
              <span>🚚</span>
              <span>${t.plate}</span>
            </div>
          `;

          const icon = L.divIcon({
            className: "all-truck-pin",
            html: iconHtml,
            iconSize: [0, 0],
          });

          const marker = L.marker([lat, lng], { icon }).addTo(map);

          const popupContent = `
            <div style="padding: 4px; font-family: inherit; min-width: 160px;">
              <b style="font-size: 14px; color: ${statusBg};">Caminhão ${t.plate}</b>
              <p style="margin: 4px 0; font-size: 12px; color: #334155;">
                Motorista: <b>${t.driver?.name || "—"}</b>
              </p>
              <p style="margin: 4px 0; font-size: 11px; color: #64748b;">
                Status: <b>${t.statusLabel}</b>
              </p>
              ${
                t.activeFreight
                  ? `<p style="margin: 4px 0; font-size: 11px;">Container: <b>${t.activeFreight.code}</b></p>`
                  : ""
              }
              <p style="margin: 4px 0 8px; font-size: 11px; color: #64748b;">
                ${t.lastPosition.healthLabel}
              </p>
            </div>
          `;

          marker.bindPopup(popupContent);
        });

        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
        }
      }
    });

    return () => {
      isSubscribed = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [isOpen, mode, truck, trailData, allTrucks]);

  if (!isOpen) return null;

  const currentLat = trailData?.current?.latitude ?? truck?.lastPosition?.latitude;
  const currentLng = trailData?.current?.longitude ?? truck?.lastPosition?.longitude;
  const googleMapsUrl =
    currentLat && currentLng
      ? `https://www.google.com/maps?q=${currentLat},${currentLng}`
      : null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="fleet-map-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="fleet-map-header">
          <div className="flex items-center gap-3">
            <span className="fleet-map-icon">
              <Truck size={22} weight="fill" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                {mode === "all" ? (
                  <>Visão Geral da Frota · Mapa em Tempo Real</>
                ) : (
                  <>
                    Caminhão {truck?.plate}
                    {truck?.activeFreight?.trailerPlate && (
                      <span className="text-xs font-normal text-slate-500">
                        (Carreta {truck.activeFreight.trailerPlate})
                      </span>
                    )}
                  </>
                )}
              </h2>
              <p className="text-xs text-slate-500">
                {mode === "all"
                  ? `${allTrucks.filter((t) => t.lastPosition).length} caminhões com sinal GPS ativo mapeados`
                  : truck?.driver?.name
                    ? `Motorista: ${truck.driver.name} · Sincronização GlobalSAT`
                    : "Sincronização GlobalSAT"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
            aria-label="Fechar mapa"
          >
            <X size={20} />
          </button>
        </div>

        {/* Map Canvas */}
        <div className="fleet-map-canvas-wrapper relative flex-1">
          <div ref={mapContainerRef} className="fleet-map-canvas w-full h-full" />
          {loading && (
            <div className="absolute top-3 right-3 bg-white/90 backdrop-blur px-3 py-1.5 rounded-md text-xs font-medium shadow text-slate-700 flex items-center gap-2 z-[1000]">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              Atualizando rastro GPS…
            </div>
          )}
          {mode === "single" && (!currentLat || !currentLng) && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-amber-50/95 border border-amber-200 text-amber-900 px-4 py-2 rounded-xl shadow-md text-xs font-medium z-[1000] flex items-center gap-2">
              <Clock size={16} className="text-amber-600 shrink-0" />
              <span>Aguardando sinal GPS da GlobalSAT · Caminhão atualmente desligado na base</span>
            </div>
          )}
          {mode === "single" && truck?.lastPosition?.isAtCompanyYard && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-emerald-50/95 border border-emerald-200 text-emerald-900 px-4 py-2 rounded-xl shadow-md text-xs font-medium z-[1000] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
              <span>Caminhão estacionado no pátio da empresa (Katueté / La Paloma)</span>
            </div>
          )}
        </div>

        {/* Telemetry Footer */}
        {mode === "single" && truck && (
          <div className="fleet-map-footer">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block font-medium">Situação</span>
                <span className="font-semibold text-slate-800 flex items-center gap-1.5 mt-0.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      truck.status === "EM_VIAGEM"
                        ? "bg-emerald-600"
                        : truck.status === "NO_PORTO"
                          ? "bg-amber-500"
                          : "bg-blue-600"
                    }`}
                  />
                  {truck.statusLabel}
                </span>
              </div>

              <div>
                <span className="text-slate-400 block font-medium">Último Sinal GPS</span>
                <span className="font-semibold text-slate-800 flex items-center gap-1.5 mt-0.5">
                  <Clock size={13} className="text-slate-500" />
                  {truck.lastPosition?.healthLabel || "Sem sinal recente"}
                </span>
              </div>

              <div>
                <span className="text-slate-400 block font-medium">Coordenadas</span>
                <span className="font-mono text-slate-700 block mt-0.5">
                  {currentLat && currentLng
                    ? `${currentLat.toFixed(5)}, ${currentLng.toFixed(5)}`
                    : "Aguardando fix"}
                </span>
              </div>

              <div className="flex items-center md:justify-end">
                {googleMapsUrl ? (
                  <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn secondary text-xs py-1.5 px-3 flex items-center gap-1.5"
                  >
                    <ArrowSquareOut size={15} />
                    Abrir no Google Maps
                  </a>
                ) : (
                  <span className="text-slate-400 text-xs">Sem coordenadas</span>
                )}
              </div>
            </div>

            {truck.activeFreight && (
              <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                <span>
                  Frete ativo: <b>{truck.activeFreight.code}</b>
                </span>
                <span>
                  {truck.activeFreight.origin || "Porto"} →{" "}
                  <b>{truck.activeFreight.destination || "Destino"}</b>
                </span>
              </div>
            )}
          </div>
        )}

        {mode === "all" && (
          <div className="fleet-map-footer text-xs text-slate-600 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" />
                Em Viagem
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                No Porto / Aduana
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
                Disponível
              </span>
            </div>
            <span className="text-slate-400">
              Clique em qualquer caminhão no mapa para visualizar os detalhes
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
