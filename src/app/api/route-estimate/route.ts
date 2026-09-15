import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  estimateRouteHours,
  findParanaguaGate,
  RouteEstimateError,
} from "@/lib/route-estimate";
import { apiError } from "@/lib/api";

const schema = z.object({
  destination: z.string().trim().min(2).max(160),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Confira o destino extraído do documento." },
      { status: 400 },
    );

  try {
    const gates = await prisma.geofence.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        active: true,
        latitude: true,
        longitude: true,
      },
    });
    const gate = findParanaguaGate(gates);
    if (!gate)
      return NextResponse.json(
        { error: "Cadastre e ative o portão de Paranaguá." },
        { status: 422 },
      );

    const apiKey = process.env.OPENROUTESERVICE_API_KEY;
    if (!apiKey)
      return NextResponse.json(
        {
          geofenceId: gate.id,
          error: "A estimativa automática de rota não está configurada.",
        },
        { status: 503 },
      );

    try {
      const transitHours = await estimateRouteHours(
        gate,
        parsed.data.destination,
        apiKey,
      );
      return NextResponse.json({ geofenceId: gate.id, transitHours });
    } catch (error) {
      if (error instanceof RouteEstimateError)
        return NextResponse.json(
          { geofenceId: gate.id, error: error.message },
          { status: 422 },
        );
      throw error;
    }
  } catch (error) {
    return apiError(error);
  }
}
