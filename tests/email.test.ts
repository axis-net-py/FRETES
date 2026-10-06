import test from "node:test";
import assert from "node:assert/strict";
import { emailOpsConfig, sendOpsEmail } from "../src/lib/email.ts";
import {
  departureEmail,
  dispatchNotification,
} from "../src/lib/notifications.ts";
import { prisma } from "../src/lib/prisma";

function withEnv(vars: Record<string, string | undefined>, run: () => void) {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("email ops config requires host, credentials and valid recipients", () => {
  withEnv(
    {
      SMTP_HOST: "smtp.gmail.com",
      SMTP_PORT: "587",
      SMTP_USER: "ops@example.com",
      SMTP_PASS: "secret",
      EMAIL_FROM: "",
      NOTIFICATION_EMAILS:
        "eeltonsilvaa@gmail.com, allaneggert1@gmail.com, invalid",
    },
    () => {
      const config = emailOpsConfig();
      assert.ok(config);
      assert.deepEqual(config!.recipients, [
        "eeltonsilvaa@gmail.com",
        "allaneggert1@gmail.com",
      ]);
      assert.equal(config!.from, "ops@example.com");
    },
  );
  withEnv({ SMTP_HOST: "", NOTIFICATION_EMAILS: "a@b.com" }, () => {
    assert.equal(emailOpsConfig(), null);
  });
  withEnv(
    {
      SMTP_HOST: "smtp.gmail.com",
      SMTP_USER: "ops@example.com",
      SMTP_PASS: "secret",
      NOTIFICATION_EMAILS: "not-an-email",
    },
    () => {
      assert.equal(emailOpsConfig(), null);
    },
  );
});

test("departure email stays within ops context and never carries secrets", () => {
  const mail = departureEmail({
    code: "MRSU2904847",
    origin: "Porto de Paranaguá",
    destination: "Santa Rita - PY",
    departedAt: new Date("2026-09-25T15:00:00Z"),
    truckPlate: "ABCD519",
    trailerPlate: "ABBK035",
    client: { name: "COTRIPAR S.A." },
    driver: { name: "EDERSON FACHINI" },
    parameters: JSON.stringify([
      "container MRSU2904847",
      "acaba de sair do Porto de Paranaguá e iniciou o trajeto",
      "EDERSON FACHINI com caminhão ABCD519 / ABBK035",
      "COTRIPAR S.A. com destino Santa Rita - PY",
      "25/09/2026 12:00 (horário de Brasília; estimativa)",
      "https://axis-fretes.vercel.app/acompanhar#secret-token",
    ]),
  });
  assert.ok(mail.subject.includes("MRSU2904847"));
  assert.ok(!mail.text.startsWith("Olá"));
  assert.ok(mail.text.includes("a carga container MRSU2904847"));
  assert.ok(mail.text.includes("EDERSON FACHINI com caminhão ABCD519 / ABBK035"));
  assert.ok(mail.text.includes("COTRIPAR S.A. com destino Santa Rita - PY"));
  assert.ok(!mail.text.includes("secret-token") || mail.text.includes("acompanhar"));
});

test("sendOpsEmail uses the injected transport and requires a message id", async () => {
  const sent: unknown[] = [];
  const id = await sendOpsEmail(
    {
      host: "smtp.gmail.com",
      port: 587,
      user: "ops@example.com",
      pass: "secret",
      from: "ops@example.com",
      recipients: ["a@b.com"],
    },
    { subject: "s", text: "b" },
    {
      sendMail: async (options) => {
        sent.push(options);
        return { messageId: "<fixture@mail>" };
      },
    },
  );
  assert.equal(id, "<fixture@mail>");
  assert.equal((sent[0] as { to: string }).to, "a@b.com");
  await assert.rejects(
    sendOpsEmail(
      {
        host: "smtp.gmail.com",
        port: 587,
        user: "ops@example.com",
        pass: "secret",
        from: "ops@example.com",
        recipients: ["a@b.com"],
      },
      { subject: "s", text: "b" },
      { sendMail: async () => ({}) },
    ),
    /identificador/,
  );
});

test("dispatch prefers email-ops without client consent when WhatsApp is down", async (t) => {
  process.env.WHATSAPP_PROVIDER = "disabled";
  process.env.SMTP_HOST = "smtp.gmail.com";
  process.env.SMTP_USER = "ops@example.com";
  process.env.SMTP_PASS = "secret";
  process.env.NOTIFICATION_EMAILS = "eeltonsilvaa@gmail.com";
  const originalFind = prisma.notification.findUnique;
  const originalUpdate = prisma.notification.update;
  const originalUpdateMany = prisma.notification.updateMany;
  const fixture = {
    id: "n-1",
    status: "NO_CONSENT",
    kind: "DEPARTURE",
    to: "",
    parameters: JSON.stringify(["C", "CODE", "x", "D", "E", "L"]),
    container: {
      code: "CODE",
      origin: "O",
      destination: "D",
      departedAt: null,
      truckPlate: "ABC1234",
      trailerPlate: null,
      client: { name: "C", consent: false },
      driver: { name: "D" },
    },
  };
  const updates: Array<{ status?: string }> = [];
  prisma.notification.findUnique = (async () => fixture) as unknown as typeof originalFind;
  prisma.notification.updateMany = (async () => ({ count: 1 })) as unknown as typeof originalUpdateMany;
  prisma.notification.update = (async ({ data }: { data: { status?: string } }) => {
    updates.push(data);
    return {
      ...fixture,
      ...data,
    };
  }) as unknown as typeof originalUpdate;
  t.after(() => {
    prisma.notification.findUnique = originalFind;
    prisma.notification.update = originalUpdate;
    prisma.notification.updateMany = originalUpdateMany;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.NOTIFICATION_EMAILS;
  });
  process.env.WHATSAPP_PROVIDER = "disabled";
  process.env.SMTP_HOST = "smtp.gmail.com";
  process.env.SMTP_USER = "ops@example.com";
  process.env.SMTP_PASS = "secret";
  process.env.NOTIFICATION_EMAILS = "eeltonsilvaa@gmail.com";
  const result = (await dispatchNotification("n-1", {
    mailTransport: {
      sendMail: async () => ({ messageId: "<ops-1>" }),
    },
  })) as { status: string; provider: string; providerRef: string };
  assert.equal(result.status, "ACCEPTED");
  assert.equal(result.provider, "email");
  assert.equal(result.providerRef, "<ops-1>");
  assert.ok(updates.some((update) => update.status === "ACCEPTED"));
});

test("dispatch dispatches ops email even when WhatsApp is configured and active", async (t) => {
  process.env.WHATSAPP_PROVIDER = "meta";
  process.env.META_WHATSAPP_TOKEN = "fixture-token";
  process.env.META_WHATSAPP_PHONE_NUMBER_ID = "123";
  process.env.META_GRAPH_VERSION = "v22.0";
  process.env.META_WHATSAPP_DEPARTURE_TEMPLATE = "frete_saida_porto_v2";
  process.env.SMTP_HOST = "smtp.gmail.com";
  process.env.SMTP_USER = "ops@example.com";
  process.env.SMTP_PASS = "secret";
  process.env.NOTIFICATION_EMAILS = "ops@example.com";

  let emailSent = false;
  const mockFetch = t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(JSON.stringify({ messages: [{ id: "wamid-test" }] })),
  );

  const originalFind = prisma.notification.findUnique;
  const originalUpdate = prisma.notification.update;
  const originalUpdateMany = prisma.notification.updateMany;
  const fixture = {
    id: "n-wa-email",
    status: "PENDING",
    kind: "DESTINATION_ARRIVAL",
    to: "+595981111111",
    parameters: JSON.stringify(["C", "CHEGADA", "x", "D", "E", "L"]),
    container: {
      code: "CODE",
      origin: "O",
      destination: "D",
      departedAt: null,
      truckPlate: "ABC1234",
      trailerPlate: null,
      client: { name: "C", consent: true },
      driver: null,
    },
  };

  prisma.notification.findUnique = (async () => fixture) as unknown as typeof originalFind;
  prisma.notification.updateMany = (async () => ({ count: 1 })) as unknown as typeof originalUpdateMany;
  prisma.notification.update = (async ({ data }: { data: object }) => ({
    ...fixture,
    ...data,
  })) as unknown as typeof originalUpdate;

  t.after(() => {
    mockFetch.mock.restore();
    prisma.notification.findUnique = originalFind;
    prisma.notification.update = originalUpdate;
    prisma.notification.updateMany = originalUpdateMany;
    delete process.env.WHATSAPP_PROVIDER;
    delete process.env.META_WHATSAPP_TOKEN;
    delete process.env.META_WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.META_GRAPH_VERSION;
    delete process.env.META_WHATSAPP_DEPARTURE_TEMPLATE;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.NOTIFICATION_EMAILS;
  });

  const result = (await dispatchNotification("n-wa-email", {
    mailTransport: {
      sendMail: async () => {
        emailSent = true;
        return { messageId: "<ops-dual>" };
      },
    },
  })) as { status: string; provider: string };

  assert.equal(emailSent, true, "Ops email must be sent even when WhatsApp is configured");
  assert.equal(result.status, "ACCEPTED");
  assert.equal(result.provider, "meta");
});
