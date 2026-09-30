import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";
import { adminRequestError } from "@/lib/admin-request";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  whatsapp: z
    .string()
    .trim()
    .regex(/^(?:\+[1-9]\d{7,14})?$/, "Informe +, código do país e número.")
    .optional(),
  consent: z.boolean().optional(),
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const unauthorized = await adminRequestError(req);
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const client = await prisma.client.findUnique({
    where: { id },
    include: { _count: { select: { containers: true } } },
  });
  if (!client)
    return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  return NextResponse.json(client);
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
      { error: p.error.issues[0].message },
      { status: 400 },
    );

  try {
    const exists = await prisma.client.findUnique({ where: { id } });
    if (!exists)
      return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });

    const updated = await prisma.client.update({
      where: { id },
      data: {
        ...(p.data.name !== undefined ? { name: p.data.name } : {}),
        ...(p.data.whatsapp !== undefined ? { whatsapp: p.data.whatsapp } : {}),
        ...(p.data.consent !== undefined ? { consent: p.data.consent } : {}),
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
  const url = new URL(req.url);
  const mergeInto = url.searchParams.get("mergeInto");

  try {
    const client = await prisma.client.findUnique({
      where: { id },
      include: { _count: { select: { containers: true } } },
    });
    if (!client)
      return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });

    const containerCount = client._count.containers;

    if (containerCount > 0) {
      if (!mergeInto) {
        return NextResponse.json(
          {
            error: `Este cliente possui ${containerCount} frete(s) vinculado(s). Selecione outro cadastro para mesclar ou exclua os fretes antes.`,
            containerCount,
            canMerge: true,
          },
          { status: 409 },
        );
      }

      if (mergeInto === id) {
        return NextResponse.json(
          { error: "O cliente de destino não pode ser o mesmo a ser excluído." },
          { status: 400 },
        );
      }

      const target = await prisma.client.findUnique({ where: { id: mergeInto } });
      if (!target) {
        return NextResponse.json(
          { error: "Cliente de destino para mesclagem não encontrado." },
          { status: 404 },
        );
      }

      await prisma.$transaction(async (tx) => {
        await tx.container.updateMany({
          where: { clientId: id },
          data: { clientId: mergeInto },
        });
        await tx.client.delete({ where: { id } });
      });

      return NextResponse.json({
        ok: true,
        deleted: true,
        mergedInto: target.id,
        reassignedContainers: containerCount,
      });
    }

    await prisma.client.delete({ where: { id } });
    return NextResponse.json({ ok: true, deleted: true });
  } catch (e) {
    return apiError(e);
  }
}

