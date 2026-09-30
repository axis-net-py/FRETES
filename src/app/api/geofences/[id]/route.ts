import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";
import { adminRequestError } from "@/lib/admin-request";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  radiusM: z.number().int().min(50).max(2000).optional(),
  active: z.boolean().optional(),
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const unauthorized = await adminRequestError(req);
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const gate = await prisma.geofence.findUnique({
    where: { id },
  });
  if (!gate)
    return NextResponse.json({ error: "Portão/Ponto não encontrado." }, { status: 404 });
  return NextResponse.json(gate);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const unauthorized = await adminRequestError(req);
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const p = updateSchema.safeParse(await req.json().catch(() => null));
  if (!p.success)
    return NextResponse.json(
      { error: "Confira os dados informados." },
      { status: 400 },
    );

  try {
    const exists = await prisma.geofence.findUnique({ where: { id } });
    if (!exists)
      return NextResponse.json({ error: "Portão não encontrado." }, { status: 404 });

    const updated = await prisma.geofence.update({
      where: { id },
      data: {
        ...(p.data.name !== undefined ? { name: p.data.name } : {}),
        ...(p.data.latitude !== undefined ? { latitude: p.data.latitude } : {}),
        ...(p.data.longitude !== undefined ? { longitude: p.data.longitude } : {}),
        ...(p.data.radiusM !== undefined ? { radiusM: p.data.radiusM } : {}),
        ...(p.data.active !== undefined ? { active: p.data.active } : {}),
      },
    });
    return NextResponse.json(updated);
  } catch (e) {
    return apiError(e);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const unauthorized = await adminRequestError(req);
  if (unauthorized) return unauthorized;
  const { id } = await params;

  try {
    const gate = await prisma.geofence.findUnique({
      where: { id },
      include: { _count: { select: { events: true } } },
    });
    if (!gate)
      return NextResponse.json({ error: "Portão não encontrado." }, { status: 404 });

    const containerCount = await prisma.container.count({
      where: { geofenceId: id },
    });

    if (containerCount > 0 || gate._count.events > 0) {
      // Safely deactivate instead of breaking foreign keys
      await prisma.geofence.update({
        where: { id },
        data: { active: false },
      });
      return NextResponse.json({
        ok: true,
        deactivated: true,
        message: "Portão desativado para manter o histórico das viagens.",
      });
    }

    await prisma.geofence.delete({ where: { id } });
    return NextResponse.json({ ok: true, deleted: true });
  } catch (e) {
    return apiError(e);
  }
}
