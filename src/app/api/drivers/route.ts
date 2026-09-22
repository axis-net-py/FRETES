import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";
import { adminRequestError } from "@/lib/admin-request";
const schema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z
    .string()
    .trim()
    .regex(/^(?:\+[1-9]\d{7,14})?$/, "Informe telefone internacional com +.")
    .default(""),
  plate: z.string().trim().max(15).default(""),
});
export async function GET() {
  return NextResponse.json(
    await prisma.driver.findMany({ orderBy: { name: "asc" } }),
  );
}
export async function POST(req: Request) {
  const unauthorized = await adminRequestError(req);
  if (unauthorized) return unauthorized;
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success)
    return NextResponse.json(
      { error: p.error.issues[0].message },
      { status: 400 },
    );
  try {
    return NextResponse.json(await prisma.driver.create({ data: p.data }), {
      status: 201,
    });
  } catch (e) {
    return apiError(e);
  }
}
