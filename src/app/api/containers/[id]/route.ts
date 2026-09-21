import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";
import { adminRequestError } from "@/lib/admin-request";
import { findParanaguaGate } from "@/lib/route-estimate";
import { normalizePlate } from "@/lib/driver-match";

const schema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{4}\d{7}$/, "Use 4 letras e 7 números no container."),
    clientId: z.string().min(1, "Selecione o cliente."),
    driverId: z.string().min(1, "Selecione o motorista."),
    geofenceId: z.string().optional(),
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
  const unauthorized = await adminRequestError(req);
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );

  try {
    const [container, client, driver] = await Promise.all([
      prisma.container.findUnique({ where: { id } }),
      prisma.client.findUnique({
        where: { id: parsed.data.clientId },
        select: { id: true },
      }),
      prisma.driver.findUnique({
        where: { id: parsed.data.driverId },
        select: { id: true },
      }),
    ]);
    if (!container)
      return NextResponse.json(
        { error: "Frete não encontrado." },
        { status: 404 },
      );
    if (!client || !driver)
      return NextResponse.json(
        { error: "Cliente ou motorista inválido." },
        { status: 400 },
      );

    const gate = findParanaguaGate(
      await prisma.geofence.findMany({
        where: { active: true },
        orderBy: { createdAt: "asc" },
      }),
    );
    if (!gate)
      return NextResponse.json(
        { error: "Cadastre e ative o portão de Paranaguá." },
        { status: 422 },
      );
    const updated = await prisma.$transaction(async (tx) => {
      const truckPlate = normalizePlate(parsed.data.truckPlate);
      const trailerPlate = normalizePlate(parsed.data.trailerPlate);
      const truck = truckPlate
        ? await tx.vehicle.upsert({
            where: { plate: truckPlate },
            create: { plate: truckPlate },
            update: {},
          })
        : null;
      const trailer = trailerPlate
        ? await tx.vehicle.upsert({
            where: { plate: trailerPlate },
            create: { plate: trailerPlate },
            update: {},
          })
        : null;
      const planningChanged =
        parsed.data.destination !== container.destination ||
        parsed.data.transitHours !== container.transitHours;
      return tx.container.update({
        where: { id },
        data: {
          ...parsed.data,
          geofenceId: gate.id,
          truckPlate,
          trailerPlate,
          truckVehicleId: truck?.id ?? null,
          trailerVehicleId: trailer?.id ?? null,
          ...(planningChanged
            ? { routeDurationSeconds: null, operationalMarginSeconds: null }
            : {}),
          ...(container.departedAt
            ? {
                estimatedArrivalAt: new Date(
                  container.departedAt.getTime() +
                    parsed.data.transitHours * 3600000,
                ),
              }
            : {}),
        },
        include: {
          client: true,
          driver: true,
          document: { select: { id: true, filename: true } },
        },
      });
    });
    const { trackingTokenHash, customerTrackingHash, ...response } = updated;
    void trackingTokenHash;
    void customerTrackingHash;
    return NextResponse.json(response);
  } catch (error) {
    return apiError(error);
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
    const exists = await prisma.container.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists)
      return NextResponse.json(
        { error: "Frete não encontrado." },
        { status: 404 },
      );

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
