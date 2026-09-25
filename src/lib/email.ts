import nodemailer from "nodemailer";

export type EmailOpsConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  recipients: string[];
};

export function emailOpsConfig(): EmailOpsConfig | null {
  const host = (process.env.SMTP_HOST || "").trim();
  const user = (process.env.SMTP_USER || "").trim();
  const pass = process.env.SMTP_PASS || "";
  const recipients = (process.env.NOTIFICATION_EMAILS || "")
    .split(",")
    .map((address) => address.trim())
    .filter((address) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address));
  if (!host || !user || !pass || recipients.length === 0) return null;
  const port = Number(process.env.SMTP_PORT) || 587;
  return {
    host,
    port,
    user,
    pass,
    from: (process.env.EMAIL_FROM || "").trim() || user,
    recipients,
  };
}

export type MailTransport = {
  sendMail(options: {
    from: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<{ messageId?: string }>;
};

export async function sendOpsEmail(
  config: EmailOpsConfig,
  mail: { subject: string; text: string },
  transport?: MailTransport,
): Promise<string> {
  const sender =
    transport ||
    nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.user, pass: config.pass },
    });
  const info = await sender.sendMail({
    from: config.from,
    to: config.recipients.join(", "),
    subject: mail.subject,
    text: mail.text,
  });
  if (!info?.messageId) throw new Error("Email sem identificador");
  return info.messageId;
}
