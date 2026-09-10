import { WhatsAppMessage, WhatsAppProvider, WhatsAppResult, normalizePhone } from "./types";

export class ConsoleWhatsAppProvider implements WhatsAppProvider {
  readonly name = "console";

  async send(message: WhatsAppMessage): Promise<WhatsAppResult> {
    console.info(`[whatsapp:console] -> ${normalizePhone(message.to)}: ${message.body}`);
    return { provider: this.name, status: "SENT", providerRef: `console-${Date.now()}` };
  }
}
