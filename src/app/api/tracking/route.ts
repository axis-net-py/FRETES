import { NextResponse } from "next/server";
import { trackingContainer } from "@/lib/tracking";
import { prisma } from "@/lib/prisma";
export async function GET(req: Request) {
  const c = await trackingContainer(req);
  if (!c)
    return NextResponse.json(
      { error: "Link inválido, expirado ou frete encerrado." },
      { status: 401 },
    );
  const gate = c.geofenceId
    ? await prisma.geofence.findUnique({ where: { id: c.geofenceId } })
    : null;
  return NextResponse.json(
    {
      id: c.id,
      code: c.code,
      status: c.status,
      driver: c.driver?.name,
      origin: c.origin,
      destination: c.destination,
      gate: gate ? { name: gate.name, radiusM: gate.radiusM } : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
