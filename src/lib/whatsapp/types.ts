export type WhatsAppMessage = {
  to: string;
  body: string;
};

export type WhatsAppResult = {
  provider: string;
  status: "SENT" | "FAILED";
  providerRef?: string;
  error?: string;
};

export interface WhatsAppProvider {
  readonly name: string;
  send(message: WhatsAppMessage): Promise<WhatsAppResult>;
}

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.startsWith("55") || digits.length > 11 ? `+${digits}` : `+55${digits}`;
}
