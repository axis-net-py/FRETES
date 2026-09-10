import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";
const schema = z.object({
  name: z.string().trim().min(2).max(120),
  whatsapp: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/, "Informe +, código do país e número."),
  consent: z.boolean().default(false),
});
export async function GET() {
  return NextResponse.json(
    await prisma.client.findMany({ orderBy: { name: "asc" } }),
  );
}
export async function POST(req: Request) {
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success)
    return NextResponse.json(
      { error: p.error.issues[0].message },
      { status: 400 },
    );
  try {
    return NextResponse.json(await prisma.client.create({ data: p.data }), {
      status: 201,
    });
  } catch (e) {
    return apiError(e);
  }
}
