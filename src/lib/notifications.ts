import { prisma } from "./prisma";
import { emailOpsConfig, sendOpsEmail, type MailTransport } from "./email";
import { eventMessage, formatUpdateMessage, isContainerCode } from "./journey";

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
  const parsed = (() => {
    try {
      const value = JSON.parse(container.parameters) as string[];
      if (Array.isArray(value)) return value;
    } catch {
      // Fall back to container fields below.
    }
    return [] as string[];
  })();
  const cargo =
    parsed[0] ||
    (isContainerCode(container.code)
      ? `container ${container.code.trim().toUpperCase()}`
      : container.code.trim().toUpperCase() || "carga solta");
  const event = parsed[1] || eventMessage(kind).eventText;
  const plates = [container.truckPlate, container.trailerPlate]
    .filter(Boolean)
    .join(" / ");
  const crewLine =
    parsed[2] ||
    (container.driver?.name
      ? `${container.driver.name} com caminhão ${plates}`
      : plates);
  const clientDest =
    parsed[3] ||
    `${container.client.name} com destino ${container.destination || "destino a confirmar"}`;
  const msg = eventMessage(kind);
  const text = formatUpdateMessage([cargo, event, crewLine, clientDest, etaText, trackingLink]);
  const subjectId = container.code || clientDest;
  return {
    subject: `[FRETES] ${msg.subject} — ${subjectId}`,
    text,
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
  const opsList = whatsappOpsNumbers();
  if (metaReady && (n.container.client.consent || opsList.length > 0))
    return dispatchWhatsApp(n, { token: token!, phone: phone!, version: version!, template: template! });
  const emailConfig = emailOpsConfig();
  // Ops email goes to fixed internal addresses, so it never needs client consent.
  if (emailConfig) return dispatchEmail(n, emailConfig, deps.mailTransport);
  if (!n.container.client.consent && !opsList.length)
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
  const env = process.env.WHATSAPP_OPS_NUMBERS;
  if (env !== undefined) {
    return env
      .split(",")
      .map((value) => value.replace(/\D/g, ""))
      .filter((value) => value.length >= 10);
  }
  return process.env.NODE_ENV === "production" ? ["595982109823"] : [];
}

export async function sendTemplateMessage(
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

export async function sendWhatsAppTestMessage(options: {
  to?: string;
  template?: string;
}) {
  const token = process.env.META_WHATSAPP_TOKEN;
  const phone = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  const version = process.env.META_GRAPH_VERSION || "v21.0";
  const template =
    options.template ||
    process.env.META_WHATSAPP_DEPARTURE_TEMPLATE ||
    process.env.META_WHATSAPP_TEMPLATE;

  if (!token) {
    throw new Error("META_WHATSAPP_TOKEN não configurado no ambiente.");
  }
  if (!phone) {
    throw new Error("META_WHATSAPP_PHONE_NUMBER_ID não configurado no ambiente.");
  }

  const rawTo = options.to || whatsappOpsNumbers()[0];
  if (!rawTo) {
    throw new Error(
      "Nenhum destinatário informado. Informe um número de telefone com DDI (ex.: +5541999999999 ou +595981234567).",
    );
  }

  const cleanTo = rawTo.replace(/\D/g, "");
  if (!cleanTo || cleanTo.length < 10) {
    throw new Error(
      "Número de telefone inválido. Informe o código do país e DDD (ex.: +5541999999999 ou +595981234567).",
    );
  }

  if (template) {
    const testParams = [
      "Operador (Teste)",
      "TEST001",
      "saiu do porto em direção ao destino",
      "Assunção - PY",
      "Hoje às 18:00 (estimativa)",
      "https://fretes.axis-net.com",
    ];
    const messageId = await sendTemplateMessage(
      { token, phone, version, template },
      cleanTo,
      JSON.stringify(testParams),
    );
    return {
      messageId,
      to: cleanTo,
      template,
      mode: "template" as const,
    };
  }

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
        recipient_type: "individual",
        to: cleanTo,
        type: "text",
        text: {
          preview_url: false,
          body: "[FRETES] Teste de integração WhatsApp Meta Cloud API realizado com sucesso!",
        },
      }),
    },
  );
  const payload = await response.json();
  if (!response.ok || !payload.messages?.[0]?.id) {
    const code = payload.error?.code || response.status;
    const msg = payload.error?.message || "Erro desconhecido da Meta.";
    throw new Error(
      `Meta recusou para ${cleanTo} (HTTP ${response.status}; código ${code}: ${msg}).`,
    );
  }

  return {
    messageId: payload.messages[0].id as string,
    to: cleanTo,
    mode: "text" as const,
  };
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
