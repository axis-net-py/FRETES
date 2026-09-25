import { prisma } from "./prisma";
import { emailOpsConfig, sendOpsEmail, type MailTransport } from "./email";

export function departureEmail(container: {
  code: string;
  origin: string | null;
  destination: string | null;
  departedAt: Date | null;
  client: { name: string };
  parameters: string;
}) {
  let trackingLink = "";
  let etaText = "";
  try {
    const parsed = JSON.parse(container.parameters) as string[];
    etaText = parsed[4] || "";
    trackingLink = parsed[5] || "";
  } catch {
    // Fall back to container fields below.
  }
  const departedText = container.departedAt
    ? container.departedAt.toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "a confirmar";
  const lines = [
    "Saída do porto confirmada pelo rastreamento.",
    `Cliente: ${container.client.name}`,
    `Container: ${container.code}`,
    `Trajeto: ${container.origin || "origem a confirmar"} → ${container.destination || "destino a confirmar"}`,
    `Saída: ${departedText} (horário de Brasília)`,
    `Previsão: ${etaText || "a confirmar"}`,
  ];
  if (trackingLink) lines.push(`Acompanhamento: ${trackingLink}`);
  return {
    subject: `[FRETES] Saída do porto — container ${container.code}`,
    text: lines.join("\n"),
  };
}

export async function dispatchNotification(
  id: string,
  deps: { mailTransport?: MailTransport } = {},
) {
  const n = await prisma.notification.findUnique({
    where: { id },
    include: { container: { include: { client: true } } },
  });
  if (
    !n ||
    !["PENDING", "FAILED", "UNCONFIGURED", "NO_CONSENT"].includes(n.status)
  )
    return n;
  if (n.kind !== "DEPARTURE")
    return prisma.notification.update({
      where: { id },
      data: {
        status: "CANCELLED",
        error: "Aviso de chegada substituído pelo aviso de saída do porto.",
      },
    });
  const {
    META_WHATSAPP_TOKEN: token,
    META_WHATSAPP_PHONE_NUMBER_ID: phone,
    META_GRAPH_VERSION: version,
  } = process.env;
  const template =
    n.kind === "DEPARTURE"
      ? process.env.META_WHATSAPP_DEPARTURE_TEMPLATE
      : process.env.META_WHATSAPP_TEMPLATE;
  const metaReady =
    process.env.WHATSAPP_PROVIDER === "meta" &&
    !!token &&
    !!phone &&
    !!template &&
    !!version;
  if (metaReady && n.container.client.consent)
    return dispatchWhatsApp(n, { token: token!, phone: phone!, version: version!, template: template! });
  const emailConfig = emailOpsConfig();
  // Ops email goes to fixed internal addresses, so it never needs client consent.
  if (emailConfig) return dispatchEmail(n, emailConfig, deps.mailTransport);
  if (!n.container.client.consent)
    return prisma.notification.update({
      where: { id },
      data: { status: "NO_CONSENT", error: "Cliente não autorizou avisos." },
    });
  return prisma.notification.update({
    where: { id },
    data: {
      status: "UNCONFIGURED",
      error: "Configure a API da Meta e um template aprovado na Vercel.",
    },
  });
}
type DispatchableNotification = {
  id: string;
  to: string;
  parameters: string;
  container: {
    code: string;
    origin: string | null;
    destination: string | null;
    departedAt: Date | null;
    client: { name: string; consent: boolean };
  };
};

async function claimForSend(id: string, statuses: string[]) {
  const claimed = await prisma.notification.updateMany({
    where: { id, status: { in: statuses } },
    data: { status: "SENDING", attempts: { increment: 1 }, error: null },
  });
  if (!claimed.count)
    return prisma.notification.findUnique({ where: { id } });
  return null;
}

async function dispatchEmail(
  n: DispatchableNotification,
  config: NonNullable<ReturnType<typeof emailOpsConfig>>,
  transport?: MailTransport,
) {
  const claimed = await claimForSend(n.id, [
    "PENDING",
    "FAILED",
    "UNCONFIGURED",
    "NO_CONSENT",
  ]);
  if (claimed) return claimed;
  try {
    const messageId = await sendOpsEmail(
      config,
      departureEmail({
        code: n.container.code,
        origin: n.container.origin,
        destination: n.container.destination,
        departedAt: n.container.departedAt,
        client: { name: n.container.client.name },
        parameters: n.parameters,
      }),
      transport,
    );
    return await prisma.notification.update({
      where: { id: n.id },
      data: {
        status: "ACCEPTED",
        provider: "email",
        providerRef: messageId,
        error: null,
      },
    });
  } catch (error) {
    return prisma.notification.update({
      where: { id: n.id },
      data: {
        status: "FAILED",
        error:
          error instanceof Error
            ? `E-mail recusou o envio (${error.message}).`.slice(0, 300)
            : "E-mail recusou o envio.",
      },
    });
  }
}

async function dispatchWhatsApp(
  n: DispatchableNotification,
  creds: { token: string; phone: string; version: string; template: string },
) {
  const { token, phone, version, template } = creds;
  try {
    const response = await fetch(
      `https://graph.facebook.com/${version}/${phone}/messages`,
      {
        method: "POST",
        signal: AbortSignal.timeout(12000),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: n.to.replace(/\D/g, ""),
          type: "template",
          template: {
            name: template,
            language: { code: process.env.META_TEMPLATE_LANGUAGE || "pt_BR" },
            components: [
              {
                type: "body",
                parameters: (JSON.parse(n.parameters) as string[]).map(
                  (text) => ({ type: "text", text }),
                ),
              },
            ],
          },
        }),
      },
    );
    const payload = await response.json();
    if (!response.ok)
      return prisma.notification.update({
        where: { id: n.id },
        data: {
          status: "FAILED",
          error: `Meta recusou o envio (HTTP ${response.status}; código ${payload.error?.code || "indisponível"}).`,
        },
      });
    if (!payload.messages?.[0]?.id)
      throw new Error("Resposta sem identificador");
    return await prisma.notification.update({
      where: { id: n.id },
      data: {
        status: "ACCEPTED",
        provider: "meta",
        providerRef: payload.messages[0].id,
        error: null,
      },
    });
  } catch {
    // A timeout may occur after Meta accepted the message. Never automatically resend.
    return prisma.notification.update({
      where: { id: n.id },
      data: {
        status: "UNKNOWN",
        error:
          "Resultado incerto. Confira na Meta antes de qualquer novo envio.",
      },
    });
  }
}
