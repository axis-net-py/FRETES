import { prisma } from "./prisma";
import { ContainerStatus, STATUS_LABELS } from "./status";
import { getWhatsAppProvider } from "./whatsapp";

type NotifyInput = {
  containerId: string;
  containerCode: string;
  status: ContainerStatus;
  clientName: string;
  clientWhatsapp: string;
  location?: string;
};

export function buildStatusMessage(input: NotifyInput): string {
  const lines = [
    `Olá ${input.clientName}, atualização do container ${input.containerCode}.`,
    `Status: ${STATUS_LABELS[input.status]}.`,
  ];
  if (input.location) lines.push(`Local: ${input.location}.`);
  lines.push(`Atualizado em ${new Date().toLocaleString("pt-BR")}.`);
  return lines.join("\n");
}

export async function notifyStatusChange(input: NotifyInput) {
  const body = buildStatusMessage(input);

  let result;
  try {
    result = await getWhatsAppProvider().send({ to: input.clientWhatsapp, body });
  } catch (error) {
    result = {
      provider: process.env.WHATSAPP_PROVIDER ?? "console",
      status: "FAILED" as const,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  return prisma.notification.create({
    data: {
      containerId: input.containerId,
      to: input.clientWhatsapp,
      body,
      provider: result.provider,
      status: result.status,
      error: result.error,
      providerRef: result.providerRef,
    },
  });
}
