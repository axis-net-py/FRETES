import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";
import { adminRequestError } from "@/lib/admin-request";
import { normalizePlate } from "@/lib/driver-match";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^(?:\+[1-9]\d{7,14})?$/, "Informe telefone internacional com +.")
    .optional(),
  plate: z.string().trim().max(15).optional(),
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const unauthorized = await adminRequestError(req);
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const driver = await prisma.driver.findUnique({
    where: { id },
    include: { _count: { select: { containers: true } } },
  });
  if (!driver)
    return NextResponse.json({ error: "Motorista não encontrado." }, { status: 404 });
  return NextResponse.json(driver);
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
    const exists = await prisma.driver.findUnique({ where: { id } });
    if (!exists)
      return NextResponse.json({ error: "Motorista não encontrado." }, { status: 404 });

    const updated = await prisma.driver.update({
      where: { id },
      data: {
        ...(p.data.name !== undefined ? { name: p.data.name } : {}),
        ...(p.data.phone !== undefined ? { phone: p.data.phone } : {}),
        ...(p.data.plate !== undefined ? { plate: normalizePlate(p.data.plate) } : {}),
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
    const driver = await prisma.driver.findUnique({
      where: { id },
      include: { _count: { select: { containers: true } } },
    });
    if (!driver)
      return NextResponse.json({ error: "Motorista não encontrado." }, { status: 404 });

    const containerCount = driver._count.containers;

    const positionCount = await prisma.position.count({
      where: { driverId: id },
    });

    if (containerCount > 0 || positionCount > 0) {
      if (!mergeInto) {
        return NextResponse.json(
          {
            error: `Este motorista possui ${containerCount} frete(s) e ${positionCount} posição(ões) de GPS vinculada(s). Selecione outro motorista para mesclar.`,
            containerCount,
            canMerge: true,
          },
          { status: 409 },
        );
      }

      if (mergeInto === id) {
        return NextResponse.json(
          { error: "O motorista de destino não pode ser o mesmo a ser excluído." },
          { status: 400 },
        );
      }

      const target = await prisma.driver.findUnique({ where: { id: mergeInto } });
      if (!target) {
        return NextResponse.json(
          { error: "Motorista de destino não encontrado." },
          { status: 404 },
        );
      }

      await prisma.$transaction(async (tx) => {
        await tx.container.updateMany({
          where: { driverId: id },
          data: { driverId: mergeInto },
        });
        await tx.position.updateMany({
          where: { driverId: id },
          data: { driverId: mergeInto },
        });
        await tx.driver.delete({ where: { id } });
      });

      return NextResponse.json({
        ok: true,
        deleted: true,
        mergedInto: target.id,
        reassignedContainers: containerCount,
      });
    }

    await prisma.driver.delete({ where: { id } });
    return NextResponse.json({ ok: true, deleted: true });
  } catch (e) {
    return apiError(e);
  }
}
