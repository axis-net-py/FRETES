import { NextResponse } from "next/server";
import { adminRequestError } from "@/lib/admin-request";
import { emailOpsConfig, sendOpsEmail } from "@/lib/email";
import { sendWhatsAppTestMessage } from "@/lib/notifications";

export async function POST(req: Request) {
  const unauthorized = await adminRequestError(req);
  if (unauthorized) return unauthorized;

  let body: { channel?: string; to?: string; template?: string } = {};
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      body = await req.json();
    }
  } catch {
    body = {};
  }

  if (body.channel === "whatsapp") {
    try {
      const result = await sendWhatsAppTestMessage({
        to: body.to,
        template: body.template,
      });
      return NextResponse.json({
        ok: true,
        channel: "whatsapp",
        ...result,
        warning:
          process.env.WHATSAPP_PROVIDER !== "meta"
            ? `Aviso: WHATSAPP_PROVIDER está configurado como '${process.env.WHATSAPP_PROVIDER || "disabled"}'. Em viagens reais, configure WHATSAPP_PROVIDER=meta na Vercel.`
            : undefined,
      });
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Falha no envio de teste do WhatsApp.",
        },
        { status: 502 },
      );
    }
  }

  const config = emailOpsConfig();
  if (!config)
    return NextResponse.json(
      { error: "E-mail operacional não configurado." },
      { status: 503 },
    );
  try {
    const messageId = await sendOpsEmail(config, {
      subject: "[FRETES] Teste de notificação por e-mail",
      text: "Envio de teste do FRETES. Se você recebeu esta mensagem, os avisos de saída do porto chegarão a este endereço.",
    });
    return NextResponse.json({
      ok: true,
      recipients: config.recipients.length,
      messageId,
    });
  } catch {
    return NextResponse.json(
      { error: "Falha no envio de teste. Confira SMTP_USER e SMTP_PASS." },
      { status: 502 },
    );
  }
}
