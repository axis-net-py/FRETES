import { NextResponse } from "next/server";
import { z } from "zod";
import { trackingContainer } from "@/lib/tracking";
import { processPosition } from "@/lib/geofence-engine";
const schema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyM: z.number().nonnegative().max(50000),
  recordedAt: z.string().datetime(),
});
export async function POST(request: Request) {
  const c = await trackingContainer(request);
  if (!c?.driverId)
    return NextResponse.json(
      { error: "Link inválido ou sem motorista." },
      { status: 401 },
    );
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Posição inválida." }, { status: 400 });
  const triggers = await processPosition({
    ...parsed.data,
    containerId: c.id,
    driverId: c.driverId,
  });
  return NextResponse.json({ triggers });
}
