import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";
const schema = z.object({
  name: z.string().trim().min(2).max(120),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusM: z.number().int().min(50).max(2000),
});
export async function GET() {
  return NextResponse.json(
    await prisma.geofence.findMany({ orderBy: { name: "asc" } }),
  );
}
export async function POST(req: Request) {
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success)
    return NextResponse.json(
      { error: "Confira nome, coordenadas e raio entre 50 e 2.000 m." },
      { status: 400 },
    );
  try {
    return NextResponse.json(
      await prisma.geofence.create({
        data: { ...p.data, status: "CHEGADA_PORTAO" },
      }),
      { status: 201 },
    );
  } catch (e) {
    return apiError(e);
  }
}
