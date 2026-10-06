import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";
import { normalizeName } from "@/lib/driver-match";
const schema = z.object({
  name: z.string().trim().min(2).max(120),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusM: z.number().int().min(50).max(2000),
  kind: z.string().trim().toUpperCase().max(30).default("CHECKPOINT"),
  notifyOnEnter: z.boolean().default(true),
  notifyOnExit: z.boolean().default(false),
});
export async function GET() {
  return NextResponse.json(
    await prisma.geofence.findMany({ orderBy: { name: "asc" } }),
  );
}
export async function POST(req: Request) {
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success)
    return NextResponse.json(
      { error: "Confira nome, coordenadas e raio entre 50 e 2.000 m." },
      { status: 400 },
    );
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73191802)`;
      const gates = await tx.geofence.findMany({
        orderBy: { createdAt: "asc" },
      });
      const name = normalizeName(p.data.name);
      const existing = gates.find(
        (g) =>
          normalizeName(g.name) === name ||
          (name.includes("PARANAGUA") &&
            normalizeName(g.name).includes("PARANAGUA")),
      );
      if (existing) return { gate: existing, created: false };
      let { kind, notifyOnEnter, notifyOnExit } = p.data;
      if (kind === "CHECKPOINT") {
        if (name.includes("PARANAGUA") || name.includes("TPC")) {
          kind = "PORT_EXIT";
          notifyOnEnter = false;
          notifyOnExit = true;
        } else if (name.includes("APPA")) {
          kind = "APPA";
          notifyOnEnter = false;
          notifyOnExit = true;
        } else if (name.includes("MULTILOG")) {
          kind = "MULTILOG";
          notifyOnEnter = true;
          notifyOnExit = false;
        } else if (
          name.includes("ADUANA") ||
          name.includes("CUSTOMS") ||
          name.includes("FRONTEIRA") ||
          name.includes("PONTE")
        ) {
          if (name.includes("SAIDA") || name.includes("LIBERACAO")) {
            kind = "CUSTOMS_EXIT";
            notifyOnEnter = false;
            notifyOnExit = true;
          } else {
            kind = "CUSTOMS_ENTRY";
            notifyOnEnter = true;
            notifyOnExit = false;
          }
        } else if (name.includes("DESTINO") || name.includes("ENTREGA")) {
          kind = "DESTINATION";
          notifyOnEnter = true;
          notifyOnExit = false;
        } else if (name.includes("SAIDA")) {
          notifyOnEnter = false;
          notifyOnExit = true;
        }
      }
      return {
        gate: await tx.geofence.create({
          data: {
            ...p.data,
            kind,
            notifyOnEnter,
            notifyOnExit,
            status: "CHEGADA_PORTAO",
          },
        }),
        created: true,
      };
    });
    return NextResponse.json(result.gate, {
      status: result.created ? 201 : 200,
    });
  } catch (e) {
    return apiError(e);
  }
}
