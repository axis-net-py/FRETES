import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";
import { findParanaguaGate } from "@/lib/route-estimate";
import { normalizePlate } from "@/lib/driver-match";
const schema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{4}\d{7}$/, "Use 4 letras e 7 números no container."),
  clientId: z.string().min(1),
  driverId: z.string().min(1),
  geofenceId: z.string().optional(),
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
  const gate = findParanaguaGate(
    await prisma.geofence.findMany({
      where: { active: true },
      orderBy: { createdAt: "asc" },
    }),
  );
  if (!gate)
    return NextResponse.json(
      { error: "Cadastre e ative o portão de Paranaguá." },
      { status: 400 },
    );
  try {
    const result = await prisma.$transaction(async (tx) => {
      const driver = await tx.driver.findUniqueOrThrow({
        where: { id: p.data.driverId },
      });
      const truckPlate = normalizePlate(driver.plate);
      const vehicle = truckPlate
        ? await tx.vehicle.upsert({
            where: { plate: truckPlate },
            create: { plate: truckPlate },
            update: {},
          })
        : null;
      return tx.container.create({
        data: {
          ...p.data,
          geofenceId: gate.id,
          truckPlate,
          truckVehicleId: vehicle?.id,
        },
      });
    });
    return NextResponse.json(result, {
      status: 201,
    });
  } catch (e) {
    return apiError(e);
  }
}
