#!/usr/bin/env node
// Simula o envio de uma posição GPS do motorista.
// Uso: node scripts/simulate-position.mjs <driverId> <lat> <lng> [baseUrl]

const [driverId, lat, lng, baseUrl = "http://localhost:3000"] = process.argv.slice(2);

if (!driverId || !lat || !lng) {
  console.error("Uso: node scripts/simulate-position.mjs <driverId> <lat> <lng> [baseUrl]");
  process.exit(1);
}

const response = await fetch(`${baseUrl}/api/positions`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ driverId, latitude: Number(lat), longitude: Number(lng) }),
});

console.log(response.status, await response.text());
