import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";
const schema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{4}\d{7}$/, "Use 4 letras e 7 números no container."),
  clientId: z.string().min(1),
  driverId: z.string().min(1),
  geofenceId: z.string().min(1),
  origin: z.string().trim().max(160),
  destination: z.string().trim().max(160),
  transitHours: z.coerce.number().int().min(1).max(720).optional(),
});
export async function GET() {
  const rows = await prisma.container.findMany({
    orderBy: { updatedAt: "desc" },
    include: { client: true, driver: true },
  });
  return NextResponse.json(
    rows.map(({ trackingTokenHash, ...r }) => {
      void trackingTokenHash;
      return r;
    }),
  );
}
export async function POST(req: Request) {
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success)
    return NextResponse.json(
      { error: p.error.issues[0].message },
      { status: 400 },
    );
  if (
    !(await prisma.geofence.findFirst({
      where: { id: p.data.geofenceId, active: true },
    }))
  )
    return NextResponse.json(
      { error: "Selecione um portão ativo." },
      { status: 400 },
    );
  try {
    return NextResponse.json(await prisma.container.create({ data: p.data }), {
      status: 201,
    });
  } catch (e) {
    return apiError(e);
  }
}
