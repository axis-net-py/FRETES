import { NextResponse } from "next/server";
import { z } from "zod";
import { processPosition } from "@/lib/geofence-engine";

export const dynamic = "force-dynamic";

const schema = z.object({
  driverId: z.string().min(1),
  containerId: z.string().min(1).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyM: z.number().nonnegative().optional(),
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const triggers = await processPosition(parsed.data);
  return NextResponse.json({ triggers });
}
