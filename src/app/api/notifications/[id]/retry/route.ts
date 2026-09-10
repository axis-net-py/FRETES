import { NextResponse } from "next/server";
import { dispatchNotification } from "@/lib/notifications";
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  return NextResponse.json(await dispatchNotification(id));
}
