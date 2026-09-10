import { WhatsAppMessage, WhatsAppProvider, WhatsAppResult, normalizePhone } from "./types";

export class TwilioWhatsAppProvider implements WhatsAppProvider {
  readonly name = "twilio";

  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly from: string,
  ) {}

  async send(message: WhatsAppMessage): Promise<WhatsAppResult> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64");
    const params = new URLSearchParams({
      From: this.from.startsWith("whatsapp:") ? this.from : `whatsapp:${this.from}`,
      To: `whatsapp:${normalizePhone(message.to)}`,
      Body: message.body,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });

    const payload = (await response.json()) as { sid?: string; message?: string };

    if (!response.ok) {
      return {
        provider: this.name,
        status: "FAILED",
        error: payload.message ?? `HTTP ${response.status}`,
      };
    }

    return { provider: this.name, status: "SENT", providerRef: payload.sid };
  }
}
