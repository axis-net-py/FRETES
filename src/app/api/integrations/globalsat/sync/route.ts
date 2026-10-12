import { handleGlobalSatSync } from "@/lib/globalsat-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleGlobalSatSync(request, { requireSecret: false });
}

export async function POST(request: Request) {
  return handleGlobalSatSync(request, { requireSecret: false });
}
