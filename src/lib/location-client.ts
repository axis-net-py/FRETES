"use client";

import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

export type Fix = {
  latitude: number;
  longitude: number;
  accuracyM?: number;
};

export type WatchHandle = { clear: () => void };

/**
 * Observa a posição usando o plugin nativo do Capacitor quando rodando em
 * Android/iOS e a Geolocation API do navegador na versão web.
 */
export async function watchPosition(
  onFix: (fix: Fix) => void,
  onError: (message: string) => void,
): Promise<WatchHandle> {
  if (Capacitor.isNativePlatform()) {
    const permission = await Geolocation.requestPermissions();
    if (permission.location === "denied") {
      onError("Permissão de localização negada");
      return { clear: () => {} };
    }

    const id = await Geolocation.watchPosition(
      { enableHighAccuracy: true, timeout: 20000 },
      (position, error) => {
        if (error || !position) {
          onError(error?.message ?? "Falha ao obter posição");
          return;
        }
        onFix({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyM: position.coords.accuracy,
        });
      },
    );

    return { clear: () => void Geolocation.clearWatch({ id }) };
  }

  if (typeof navigator === "undefined" || !navigator.geolocation) {
    onError("Geolocalização não suportada neste dispositivo");
    return { clear: () => {} };
  }

  const id = navigator.geolocation.watchPosition(
    (position) =>
      onFix({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyM: position.coords.accuracy,
      }),
    (error) => onError(error.message),
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 },
  );

  return { clear: () => navigator.geolocation.clearWatch(id) };
}
