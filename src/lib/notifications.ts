import { prisma } from "./prisma";
import { emailOpsConfig, sendOpsEmail, type MailTransport } from "./email";
import { eventMessage } from "./journey";

export function departureEmail(
  container: {
    code: string;
    origin: string | null;
    destination: string | null;
    departedAt: Date | null;
    truckPlate: string | null;
    trailerPlate: string | null;
    client: { name: string };
    driver: { name: string } | null;
    parameters: string;
  },
  kind = "DEPARTURE",
) {
  let trackingLink = "";
  let etaText = "";
  try {
    const parsed = JSON.parse(container.parameters) as string[];
    etaText = parsed[4] || "";
    trackingLink = parsed[5] || "";
  } catch {
    // Fall back to container fields below.
  }
  const msg = eventMessage(
    kind,
    [
      container.driver?.name,
      [container.truckPlate, container.trailerPlate]
        .filter(Boolean)
        .join(" / "),
    ]
      .filter(Boolean)
      .join(" · "),
  );
  const departedText = container.departedAt
    ? container.departedAt.toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "a confirmar";
  const lines = [
    msg.headline,
    `Cliente: ${container.client.name}`,
    `Container: ${container.code}`,
    `Motorista: ${container.driver?.name || "a confirmar"}`,
    `Cavalo: ${container.truckPlate || "a confirmar"} · Carreta: ${container.trailerPlate || "a confirmar"}`,
    `Trajeto: ${container.origin || "origem a confirmar"} �  ${container.destination || "destino a confirmar"}`,
  ];
  if (kind === "DEPARTURE")
    lines.push(`Saída: ${departedText} (horário de Brasília)`);
  lines.push(`Previsão: ${etaText || "a confirmar"}`);
  if (trackingLink) lines.push(`Acompanhamento: ${trackingLink}`);
  return {
    subject: `[FRETES] ${msg.subject} � container ${container.code}`,
    text: lines.join("\n"),
  };
}

export async function dispatchNotification(
  id: string,
  deps: { mailTransport?: MailTransport } = {},
) {
  const n = await prisma.notification.findUnique({
    where: { id },
    include: { container: { include: { client: true, driver: true } } },
  });
  if (
    !n ||
    !["PENDING", "FAILED", "UNCONFIGURED", "NO_CONSENT"].includes(n.status)
  )
    return n;
  if (
    ![
      "DEPARTURE",
      "MULTILOG_ARRIVAL",
      "CUSTOMS_ENTRY",
      "CUSTOMS_EXIT",
    ].includes(n.kind)
  )
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
    process.env.META_WHATSAPP_DEPARTURE_TEMPLATE ||
    process.env.META_WHATSAPP_TEMPLATE;
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
  kind: string;
  parameters: string;
  container: {
    code: string;
    origin: string | null;
    destination: string | null;
    departedAt: Date | null;
    truckPlate: string | null;
    trailerPlate: string | null;
    client: { name: string; consent: boolean };
    driver: { name: string } | null;
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
      departureEmail(
        {
          code: n.container.code,
          origin: n.container.origin,
          destination: n.container.destination,
          departedAt: n.container.departedAt,
          truckPlate: n.container.truckPlate,
          trailerPlate: n.container.trailerPlate,
          client: { name: n.container.client.name },
          driver: n.container.driver ? { name: n.container.driver.name } : null,
          parameters: n.parameters,
        },
        n.kind,
      ),
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

export function whatsappOpsNumbers(): string[] {
  return (process.env.WHATSAPP_OPS_NUMBERS || "")
    .split(",")
    .map((value) => value.replace(/\D/g, ""))
    .filter((value) => value.length >= 10);
}

async function sendTemplateMessage(
  creds: { token: string; phone: string; version: string; template: string },
  to: string,
  parameters: string,
) {
  const response = await fetch(
    `https://graph.facebook.com/${creds.version}/${creds.phone}/messages`,
    {
      method: "POST",
      signal: AbortSignal.timeout(12000),
      headers: {
        Authorization: `Bearer ${creds.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: creds.template,
          language: { code: process.env.META_TEMPLATE_LANGUAGE || "pt_BR" },
          components: [
            {
              type: "body",
              parameters: (JSON.parse(parameters) as string[]).map((text) => ({
                type: "text",
                text,
              })),
            },
          ],
        },
      }),
    },
  );
  const payload = await response.json();
  if (!response.ok || !payload.messages?.[0]?.id)
    throw new Error(
      `Meta recusou para ${to} (HTTP ${response.status}; c�digo ${payload.error?.code || "indispon�vel"}).`,
    );
  return payload.messages[0].id as string;
}

async function dispatchWhatsApp(
  n: DispatchableNotification,
  creds: { token: string; phone: string; version: string; template: string },
) {
  const recipients: { to: string; ops: boolean }[] = [];
  if (n.container.client.consent && n.to.replace(/\D/g, ""))
    recipients.push({ to: n.to.replace(/\D/g, ""), ops: false });
  for (const ops of whatsappOpsNumbers())
    if (!recipients.some((recipient) => recipient.to === ops))
      recipients.push({ to: ops, ops: true });
  if (!recipients.length)
    return prisma.notification.update({
      where: { id: n.id },
      data: { status: "NO_CONSENT", error: "Cliente não autorizou avisos." },
    });
  try {
    const results: { to: string; ops: boolean; id?: string; error?: string }[] =
      [];
    for (const recipient of recipients) {
      try {
        results.push({
          ...recipient,
          id: await sendTemplateMessage(creds, recipient.to, n.parameters),
        });
      } catch (error) {
        results.push({
          ...recipient,
          error: error instanceof Error ? error.message : "Falha no envio.",
        });
      }
    }
    const primary = results.find((result) => !result.ops) || results[0];
    if (!primary.id)
      return prisma.notification.update({
        where: { id: n.id },
        data: { status: "FAILED", error: primary.error || "Meta recusou o envio." },
      });
    const failedCopies = results.filter((result) => !result.id);
    return await prisma.notification.update({
      where: { id: n.id },
      data: {
        status: "ACCEPTED",
        provider: "meta",
        providerRef: primary.id,
        error: failedCopies.length
          ? `Cópia operacional pendente: ${failedCopies.map((result) => result.to).join(", ")}.`
          : null,
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
