import { handleGlobalSatSync } from "@/lib/globalsat-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleGlobalSatSync(request, { requireSecret: false });
}
