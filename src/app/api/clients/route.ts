import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().min(1),
  whatsapp: z.string().min(8),
});

export async function GET() {
  return NextResponse.json(await prisma.client.findMany({ orderBy: { name: "asc" } }));
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const client = await prisma.client.create({
    data: { name: parsed.data.name, whatsapp: normalizePhone(parsed.data.whatsapp) },
  });
  return NextResponse.json(client, { status: 201 });
}
