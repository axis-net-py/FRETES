import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { documentFieldsSchema } from "@/lib/document-fields";
import { apiError } from "@/lib/api";
import { resolveImportRecords, ImportConflict } from "@/lib/import-records";
import { findParanaguaGate } from "@/lib/route-estimate";
import { adminRequestError } from "@/lib/admin-request";
const schema = z.object({
  fields: documentFieldsSchema,
  clientId: z.string(),
  driverId: z.string(),
  geofenceId: z.string().optional(),
  whatsapp: z.string().regex(/^(?:\+[1-9]\d{7,14})?$/),
  consent: z.boolean(),
  confirmed: z.literal(true),
  transitHours: z.coerce.number().int().min(1).max(720).optional(),
  routeDurationSeconds: z.number().int().positive().max(2592000).nullish(),
  operationalMarginSeconds: z.number().int().positive().max(864000).nullish(),
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
  const unauthorized = await adminRequestError(req);
  if (unauthorized) return unauthorized;
  const { id } = await params;
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success)
    return NextResponse.json(
      { error: p.error.issues[0].message },
      { status: 400 },
    );
  try {
    const d = p.data;
    const gate = findParanaguaGate(
      await prisma.geofence.findMany({
        where: { active: true },
        orderBy: { createdAt: "asc" },
      }),
    );
    if (!gate)
      return NextResponse.json(
        { error: "Cadastre e ative o portão do Porto de Paranaguá." },
        { status: 422 },
      );
    if (!!d.routeDurationSeconds !== !!d.operationalMarginSeconds)
      return NextResponse.json(
        { error: "Informe a duração e a margem juntas." },
        { status: 400 },
      );
    const transitHours =
      d.routeDurationSeconds && d.operationalMarginSeconds
        ? Math.ceil(
            (d.routeDurationSeconds + d.operationalMarginSeconds) / 3600,
          )
        : d.transitHours;
    if (!transitHours || transitHours > 720)
      return NextResponse.json(
        { error: "Informe uma estimativa de 1 a 720 horas." },
        { status: 400 },
      );
    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(73191801)`;
        const doc = await tx.tripDocument.findUnique({
          where: { id },
          select: { containerId: true },
        });
        if (!doc) throw new Error("Missing document");
        if (doc.containerId) return { id: doc.containerId };
        const records = await resolveImportRecords(tx, { ...d, ...d.fields });
        const { clientName, driverName, ...fields } = d.fields;
        void clientName;
        void driverName;
        const container = await tx.container.create({
          data: {
            ...fields,
            ...records,
            geofenceId: gate.id,
            transitHours,
            routeDurationSeconds: d.routeDurationSeconds ?? null,
            operationalMarginSeconds: d.operationalMarginSeconds ?? null,
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
    if (e instanceof ImportConflict)
      return NextResponse.json({ error: e.message }, { status: 409 });
    return apiError(e);
  }
}
