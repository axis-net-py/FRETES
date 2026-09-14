import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
const schema = z.object({ transitHours: z.number().int().min(1).max(720) });
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params,
    p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success)
    return NextResponse.json(
      { error: "Informe de 1 a 720 horas." },
      { status: 400 },
    );
  const c = await prisma.container.findUnique({ where: { id } });
  if (!c)
    return NextResponse.json(
      { error: "Frete não encontrado." },
      { status: 404 },
    );
  if (c.status === "ENTREGUE")
    return NextResponse.json(
      { error: "A viagem já foi entregue." },
      { status: 400 },
    );
  await prisma.container.update({
    where: { id },
    data: {
      transitHours: p.data.transitHours,
      estimatedArrivalAt: c.departedAt
        ? new Date(c.departedAt.getTime() + p.data.transitHours * 3600000)
        : null,
    },
  });
  return NextResponse.json({ ok: true });
}
