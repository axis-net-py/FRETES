import { NextResponse } from "next/server";
import { adminRequestError } from "@/lib/admin-request";
import { emailOpsConfig, sendOpsEmail } from "@/lib/email";

export async function POST(req: Request) {
  const unauthorized = await adminRequestError(req);
  if (unauthorized) return unauthorized;
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
