import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const schema = z.object({
  code: z.string().min(4),
  clientId: z.string().min(1),
  driverId: z.string().min(1).optional(),
  origin: z.string().optional(),
  destination: z.string().optional(),
});

export async function GET() {
  const containers = await prisma.container.findMany({
    orderBy: { updatedAt: "desc" },
    include: { client: true, driver: true },
  });
  return NextResponse.json(containers);
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const container = await prisma.container.create({ data: parsed.data });
  return NextResponse.json(container, { status: 201 });
}
