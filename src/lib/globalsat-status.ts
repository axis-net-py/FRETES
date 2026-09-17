export type GlobalSatDashboardState = {
  configured: boolean;
  status: "ok" | "pending" | "error";
  lastSyncAt: string | null;
};

export function dashboardGlobalSatState(
  state: { lastSucceededAt: Date | null; lastError: string | null } | null,
  configured: boolean,
): GlobalSatDashboardState {
  return {
    configured,
    status: state?.lastError ? "error" : state?.lastSucceededAt ? "ok" : "pending",
    lastSyncAt: state?.lastSucceededAt?.toISOString() || null,
  };
}
