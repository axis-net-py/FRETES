import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { documentFieldsSchema } from "@/lib/document-fields";
import { apiError } from "@/lib/api";
const schema = z.object({
  fields: documentFieldsSchema,
  clientId: z.string(),
  driverId: z.string(),
  geofenceId: z.string().min(1, "Selecione o portão de chegada."),
  whatsapp: z.string().regex(/^(?:\+[1-9]\d{7,14})?$/),
  consent: z.boolean(),
  confirmed: z.literal(true),
  transitHours: z.coerce.number().int().min(1).max(720).optional(),
});
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const doc = await prisma.tripDocument.findUnique({ where: { id } });
  if (!doc)
    return NextResponse.json(
      { error: "Documento não encontrado." },
      { status: 404 },
    );
  return new Response(new Uint8Array(doc.content), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success)
    return NextResponse.json(
      { error: p.error.issues[0].message },
      { status: 400 },
    );
  try {
    const d = p.data;
    if (
      d.geofenceId &&
      !(await prisma.geofence.findFirst({
        where: { id: d.geofenceId, active: true },
      }))
    )
      return NextResponse.json({ error: "Portão inválido." }, { status: 400 });
    const result = await prisma.$transaction(
      async (tx) => {
        const doc = await tx.tripDocument.findUnique({
          where: { id },
          select: { containerId: true },
        });
        if (!doc) throw new Error("Missing document");
        if (doc.containerId) return { id: doc.containerId };
        const client = d.clientId
          ? await tx.client.findUniqueOrThrow({ where: { id: d.clientId } })
          : await tx.client.create({
              data: {
                name: d.fields.clientName,
                whatsapp: d.whatsapp,
                consent: !!d.whatsapp && d.consent,
              },
            });
        const driver = d.driverId
          ? await tx.driver.findUniqueOrThrow({ where: { id: d.driverId } })
          : await tx.driver.create({
              data: {
                name: d.fields.driverName,
                phone: "",
                plate: d.fields.truckPlate,
              },
            });
        const { clientName, driverName, ...fields } = d.fields;
        void clientName;
        void driverName;
        const container = await tx.container.create({
          data: {
            ...fields,
            clientId: client.id,
            driverId: driver.id,
            geofenceId: d.geofenceId || null,
            transitHours: d.transitHours,
          },
        });
        await tx.tripDocument.update({
          where: { id },
          data: { containerId: container.id },
        });
        return { id: container.id };
      },
      { maxWait: 10000, timeout: 15000 },
    );
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
