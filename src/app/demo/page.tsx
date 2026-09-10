import { Suspense } from "react";
import Dashboard, { DashboardData } from "@/components/dashboard";
const names = [
  "Atlântica Importações",
  "Madeireira Araucária",
  "Grupo Vento Sul",
  "Brava Comércio Exterior",
  "Serra Alta Alimentos",
  "Litoral Equipamentos",
];
const statuses = [
  "EM_TRANSITO",
  "CHEGADA_PORTAO",
  "LIBERADO",
  "EM_TRANSITO",
  "ENTREGUE",
  "CARREGADO",
];
const data: DashboardData = {
  containers: names.map((name, i) => ({
    id: "demo-" + i,
    code: [
      "MSCU7294816",
      "TCLU5839204",
      "CMAU4187362",
      "MSCU8621953",
      "OOLU3476198",
      "HLCU6924081",
    ][i],
    status: statuses[i],
    origin: "Porto de Santos",
    destination: [
      "Curitiba, PR",
      "Itajaí, SC",
      "São Paulo, SP",
      "Campinas, SP",
      "Joinville, SC",
      "Santos, SP",
    ][i],
    client: { name },
    driver: {
      name: [
        "Ricardo Almeida",
        "Márcio Fernandes",
        "Anderson Costa",
        "Edson Ribeiro",
        "Cláudio Martins",
        "Paulo Becker",
      ][i],
      plate: ["RGT4E29", "FQM8A63", "BZX2J71", "LPA6D48", "SDR9G25", "KMT3H86"][
        i
      ],
    },
    updatedAt: "2026-09-10T" + String(12 - i).padStart(2, "0") + ":24:00Z",
  })),
  clients: names.map((name, i) => ({ id: "c" + i, name })),
  drivers: Array.from({ length: 6 }, (_, i) => ({
    id: "d" + i,
    name: "Motorista " + i,
  })),
  gates: [
    {
      id: "g1",
      name: "Porto de Santos · Portão de exemplo",
      latitude: -23.94215,
      longitude: -46.31056,
      radiusM: 300,
      active: true,
    },
  ],
  notifications: [
    {
      id: "n1",
      body: "Chegada ao portão de liberação identificada.",
      status: "SIMULATED",
      createdAt: "2026-09-10T12:14:00Z",
      container: { code: "TCLU5839204" },
    },
    {
      id: "n2",
      body: "Atualização do container registrada.",
      status: "SIMULATED",
      createdAt: "2026-09-10T11:48:00Z",
      container: { code: "CMAU4187362" },
    },
  ],
  whatsappReady: false,
};
export default function Demo() {
  return (
    <Suspense>
      <Dashboard data={data} demo />
    </Suspense>
  );
}
