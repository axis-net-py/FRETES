import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { COOKIE, createSession } from "@/lib/session";
export async function POST(req: Request) {
  if (!process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET)
    return NextResponse.json(
      { error: "Acesso ainda não configurado" },
      { status: 503 },
    );
  const input = await req.json().catch(() => null);
  if (typeof input?.password !== "string" || input.password.length > 200)
    return NextResponse.json({ error: "Senha inválida" }, { status: 400 });
  const key = createHash("sha256")
    .update(req.headers.get("x-forwarded-for")?.split(",")[0] || "local")
    .digest("hex");
  await prisma.loginAttempt.deleteMany({
    where: { key, expiresAt: { lt: new Date() } },
  });
  const attempt = await prisma.loginAttempt.upsert({
    where: { key },
    create: { key, expiresAt: new Date(Date.now() + 900000) },
    update: { count: { increment: 1 } },
  });
  if (attempt.count > 10)
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde 15 minutos." },
      { status: 429 },
    );
  const hash = (v: string) => createHash("sha256").update(v).digest();
  if (!timingSafeEqual(hash(input.password), hash(process.env.ADMIN_PASSWORD)))
    return NextResponse.json({ error: "Senha incorreta" }, { status: 401 });
  await prisma.loginAttempt.deleteMany({ where: { key } });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await createSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 43200,
  });
  return res;
}
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}
