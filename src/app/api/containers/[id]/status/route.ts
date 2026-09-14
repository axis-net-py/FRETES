import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { CONTAINER_STATUSES } from "@/lib/status";
const schema = z.object({ status: z.enum(CONTAINER_STATUSES) });
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const data = schema.safeParse(await req.json().catch(() => null));
  if (!data.success)
    return NextResponse.json({ error: "Status inválido" }, { status: 400 });
  if (data.data.status === "A_CAMINHO_DESTINO")
    return NextResponse.json(
      { error: "A saída do porto é confirmada pelo GPS após entrada na área." },
      { status: 400 },
    );
  const c = await prisma.container.findUnique({ where: { id } });
  if (!c)
    return NextResponse.json(
      { error: "Frete não encontrado" },
      { status: 404 },
    );
  if (
    CONTAINER_STATUSES.indexOf(data.data.status) <=
    CONTAINER_STATUSES.indexOf(c.status as (typeof CONTAINER_STATUSES)[number])
  )
    return NextResponse.json(
      { error: "Escolha uma etapa posterior à atual." },
      { status: 400 },
    );
  return NextResponse.json(
    await prisma.container.update({
      where: { id },
      data: {
        status: data.data.status,
        ...(data.data.status === "ENTREGUE"
          ? { trackingTokenHash: null, trackingExpiresAt: null }
          : {}),
      },
    }),
  );
}
