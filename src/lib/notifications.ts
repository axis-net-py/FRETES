import { prisma } from "./prisma";
export async function dispatchNotification(id: string) {
  const n = await prisma.notification.findUnique({
    where: { id },
    include: { container: { include: { client: true } } },
  });
  if (!n || !["PENDING", "FAILED", "UNCONFIGURED"].includes(n.status)) return n;
  if (n.kind !== "DEPARTURE")
    return prisma.notification.update({
      where: { id },
      data: {
        status: "CANCELLED",
        error: "Aviso de chegada substituído pelo aviso de saída do porto.",
      },
    });
  if (!n.container.client.consent)
    return prisma.notification.update({
      where: { id },
      data: { status: "NO_CONSENT", error: "Cliente não autorizou avisos." },
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
  if (
    process.env.WHATSAPP_PROVIDER !== "meta" ||
    !token ||
    !phone ||
    !template ||
    !version
  ) {
    return prisma.notification.update({
      where: { id },
      data: {
        status: "UNCONFIGURED",
        error: "Configure a API da Meta e um template aprovado na Vercel.",
      },
    });
  }
  const claimed = await prisma.notification.updateMany({
    where: { id, status: { in: ["PENDING", "FAILED", "UNCONFIGURED"] } },
    data: { status: "SENDING", attempts: { increment: 1 }, error: null },
  });
  if (!claimed.count) return prisma.notification.findUnique({ where: { id } });
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
        where: { id },
        data: {
          status: "FAILED",
          error: `Meta recusou o envio (HTTP ${response.status}; código ${payload.error?.code || "indisponível"}).`,
        },
      });
    if (!payload.messages?.[0]?.id)
      throw new Error("Resposta sem identificador");
    return await prisma.notification.update({
      where: { id },
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
      where: { id },
      data: {
        status: "UNKNOWN",
        error:
          "Resultado incerto. Confira na Meta antes de qualquer novo envio.",
      },
    });
  }
}
