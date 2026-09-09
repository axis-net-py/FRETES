import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { CONTAINER_STATUSES } from "@/lib/status";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusM: z.number().int().min(30).max(20000).default(300),
  status: z.enum(CONTAINER_STATUSES).default("CHEGADA_PORTAO"),
  active: z.boolean().default(true),
});

export async function GET() {
  return NextResponse.json(await prisma.geofence.findMany({ orderBy: { name: "asc" } }));
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const geofence = await prisma.geofence.create({ data: parsed.data });
  return NextResponse.json(geofence, { status: 201 });
}
