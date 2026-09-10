import { ConsoleWhatsAppProvider } from "./console";
import { MetaWhatsAppProvider } from "./meta";
import { TwilioWhatsAppProvider } from "./twilio";
import { WhatsAppProvider } from "./types";

export function getWhatsAppProvider(): WhatsAppProvider {
  const provider = (process.env.WHATSAPP_PROVIDER ?? "console").toLowerCase();

  if (provider === "twilio") {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM } = process.env;
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM) {
      throw new Error("Credenciais do Twilio ausentes (veja .env.example)");
    }
    return new TwilioWhatsAppProvider(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM);
  }

  if (provider === "meta") {
    const { META_WHATSAPP_TOKEN, META_WHATSAPP_PHONE_NUMBER_ID } = process.env;
    if (!META_WHATSAPP_TOKEN || !META_WHATSAPP_PHONE_NUMBER_ID) {
      throw new Error("Credenciais da Meta Cloud API ausentes (veja .env.example)");
    }
    return new MetaWhatsAppProvider(META_WHATSAPP_TOKEN, META_WHATSAPP_PHONE_NUMBER_ID);
  }

  return new ConsoleWhatsAppProvider();
}

export * from "./types";
