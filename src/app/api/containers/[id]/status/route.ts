import { NextResponse } from "next/server";
import { z } from "zod";
import { notifyStatusChange } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { CONTAINER_STATUSES } from "@/lib/status";

export const dynamic = "force-dynamic";

const schema = z.object({
  status: z.enum(CONTAINER_STATUSES),
  notify: z.boolean().default(true),
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const container = await prisma.container.update({
    where: { id: params.id },
    data: { status: parsed.data.status },
    include: { client: true },
  });

  if (parsed.data.notify) {
    await notifyStatusChange({
      containerId: container.id,
      containerCode: container.code,
      status: parsed.data.status,
      clientName: container.client.name,
      clientWhatsapp: container.client.whatsapp,
    });
  }

  return NextResponse.json(container);
}
