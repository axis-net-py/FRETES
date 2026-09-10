import { prisma } from "@/lib/prisma";
import { ContainerStatus, STATUS_LABELS } from "@/lib/status";

export const dynamic = "force-dynamic";

function statusLabel(status: string) {
  return STATUS_LABELS[status as ContainerStatus] ?? status;
}

export default async function DashboardPage() {
  const [containers, notifications, geofences] = await Promise.all([
    prisma.container.findMany({
      orderBy: { updatedAt: "desc" },
      include: { client: true, driver: true },
    }),
    prisma.notification.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { container: true },
    }),
    prisma.geofence.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="mb-3 text-xl font-semibold">Containers</h1>
        {containers.length === 0 ? (
          <p className="text-sm text-slate-400">
            Nenhum container cadastrado. Use a aba Cadastro para começar.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900 text-slate-300">
                <tr>
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2">Motorista</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Atualizado</th>
                </tr>
              </thead>
              <tbody>
                {containers.map((container) => (
                  <tr key={container.id} className="border-t border-slate-800">
                    <td className="px-3 py-2 font-mono">{container.code}</td>
                    <td className="px-3 py-2">{container.client.name}</td>
                    <td className="px-3 py-2">{container.driver?.name ?? "—"}</td>
                    <td className="px-3 py-2">{statusLabel(container.status)}</td>
                    <td className="px-3 py-2 text-slate-400">
                      {container.updatedAt.toLocaleString("pt-BR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Geofences ativas</h2>
        {geofences.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma geofence cadastrada.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {geofences.map((geofence) => (
              <li key={geofence.id} className="rounded-lg border border-slate-800 px-3 py-2">
                <span className="font-medium">{geofence.name}</span>{" "}
                <span className="text-slate-400">
                  ({geofence.latitude.toFixed(5)}, {geofence.longitude.toFixed(5)}) · raio{" "}
                  {geofence.radiusM} m · dispara {statusLabel(geofence.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Mensagens enviadas</h2>
        {notifications.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma mensagem enviada ainda.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {notifications.map((notification) => (
              <li key={notification.id} className="rounded-lg border border-slate-800 px-3 py-2">
                <div className="flex flex-wrap justify-between gap-2 text-slate-400">
                  <span>
                    {notification.container.code} → {notification.to} ({notification.provider})
                  </span>
                  <span>
                    {notification.status} · {notification.createdAt.toLocaleString("pt-BR")}
                  </span>
                </div>
                <p className="whitespace-pre-line text-slate-200">{notification.body}</p>
                {notification.error && (
                  <p className="text-red-400">Erro: {notification.error}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
