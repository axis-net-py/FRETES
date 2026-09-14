import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";

const schema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{4}\d{7}$/, "Use 4 letras e 7 números no container."),
    clientId: z.string().min(1, "Selecione o cliente."),
    driverId: z.string().min(1, "Selecione o motorista."),
    geofenceId: z.string().min(1, "Selecione o portão."),
    origin: z.string().trim().max(160),
    destination: z.string().trim().max(160),
    crt: z.string().trim().max(80),
    micDta: z.string().trim().max(80),
    truckPlate: z.string().trim().toUpperCase().max(15),
    trailerPlate: z.string().trim().toUpperCase().max(15),
    freightValue: z
      .string()
      .regex(
        /^(?:\d{1,12}(?:\.\d{1,2})?)?$/,
        "Use o valor com ponto decimal, por exemplo 2200.00.",
      ),
    freightCurrency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^(?:[A-Z]{3})?$/, "Informe uma moeda de 3 letras."),
    seal: z.string().trim().max(80),
    transitHours: z.coerce.number().int().min(1).max(720),
  })
  .refine(
    (data) => !data.freightValue || !!data.freightCurrency,
    "Informe a moeda do frete.",
  );

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );

  try {
    const [container, client, driver, geofence] = await Promise.all([
      prisma.container.findUnique({ where: { id }, select: { id: true } }),
      prisma.client.findUnique({
        where: { id: parsed.data.clientId },
        select: { id: true },
      }),
      prisma.driver.findUnique({
        where: { id: parsed.data.driverId },
        select: { id: true },
      }),
      prisma.geofence.findFirst({
        where: { id: parsed.data.geofenceId, active: true },
        select: { id: true },
      }),
    ]);
    if (!container)
      return NextResponse.json({ error: "Frete não encontrado." }, { status: 404 });
    if (!client || !driver || !geofence)
      return NextResponse.json(
        { error: "Cliente, motorista ou portão inválido." },
        { status: 400 },
      );

    const updated = await prisma.container.update({
      where: { id },
      data: parsed.data,
      include: { client: true, driver: true, document: true },
    });
    return NextResponse.json(updated);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const exists = await prisma.container.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists)
      return NextResponse.json({ error: "Frete não encontrado." }, { status: 404 });

    await prisma.$transaction(async (tx) => {
      await tx.notification.deleteMany({ where: { containerId: id } });
      await tx.geofenceEvent.deleteMany({ where: { containerId: id } });
      await tx.position.updateMany({
        where: { containerId: id },
        data: { containerId: null },
      });
      await tx.tripDocument.updateMany({
        where: { containerId: id },
        data: { containerId: null },
      });
      await tx.container.delete({ where: { id } });
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    return apiError(error);
  }
}
