import { NextResponse } from "next/server";
import { GlobalSatError } from "./globalsat-client";
import { syncGlobalSat, type GlobalSatSyncSummary } from "./globalsat-sync";
import { validSyncSecret } from "./sync-secret";

type Sync = () => Promise<GlobalSatSyncSummary>;

function json(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function handleGlobalSatSync(
  request: Request,
  options: { requireSecret: boolean; sync?: Sync },
) {
  if (
    options.requireSecret &&
    !validSyncSecret(request.headers.get("authorization"))
  )
    return json({ error: "Não autorizado." }, 401);

  try {
    const summary = await (options.sync || syncGlobalSat)();
    return json(summary, summary.status === "already_running" ? 202 : 200);
  } catch (error) {
    if (error instanceof GlobalSatError)
      return json({ error: "GlobalSAT temporariamente indisponível." }, 503);
    return json({ error: "Não foi possível sincronizar a GlobalSAT." }, 500);
  }
}
