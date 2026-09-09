import { WhatsAppMessage, WhatsAppProvider, WhatsAppResult, normalizePhone } from "./types";

type MetaResponse = {
  messages?: { id: string }[];
  error?: { message: string };
};

export class MetaWhatsAppProvider implements WhatsAppProvider {
  readonly name = "meta";

  constructor(
    private readonly token: string,
    private readonly phoneNumberId: string,
  ) {}

  async send(message: WhatsAppMessage): Promise<WhatsAppResult> {
    const response = await fetch(
      `https://graph.facebook.com/v20.0/${this.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: normalizePhone(message.to).replace("+", ""),
          type: "text",
          text: { body: message.body },
        }),
      },
    );

    const payload = (await response.json()) as MetaResponse;

    if (!response.ok) {
      return {
        provider: this.name,
        status: "FAILED",
        error: payload.error?.message ?? `HTTP ${response.status}`,
      };
    }

    return { provider: this.name, status: "SENT", providerRef: payload.messages?.[0]?.id };
  }
}
