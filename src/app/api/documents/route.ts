import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { detectDocumentType, emptyFields } from "@/lib/document-fields";
import {
  extractDocument,
  DocumentExtractionError,
} from "@/lib/document-extraction";
import { documentProvider } from "@/lib/document-provider";
import { apiError } from "@/lib/api";
export const maxDuration = 60;
export async function GET() {
  return NextResponse.json({
    ...documentProvider(),
    documents: await prisma.tripDocument.findMany({
      take: 30,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        filename: true,
        createdAt: true,
        containerId: true,
        extracted: true,
      },
    }),
  });
}
export async function POST(req: Request) {
  if (Number(req.headers.get("content-length")) > 4_100_000)
    return NextResponse.json(
      { error: "Limite de 4 MB por arquivo." },
      { status: 413 },
    );
  try {
    const form = await req.formData();
    const config = documentProvider();
    const manual = form.get("mode") === "manual";
    if (!manual && config.testOnly && form.get("testDocument") !== "on")
      return NextResponse.json(
        {
          error:
            "Neste modo, envie apenas documentos fictícios ou anonimizados, sem informações pessoais ou confidenciais.",
        },
        { status: 400 },
      );
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > 4_000_000)
      return NextResponse.json(
        { error: "Envie um PDF, JPG ou PNG de até 4 MB." },
        { status: 400 },
      );
    const content = Buffer.from(await file.arrayBuffer());
    const mimeType = detectDocumentType(content);
    if (!mimeType)
      return NextResponse.json(
        { error: "Formato inválido. Use PDF, JPG ou PNG." },
        { status: 400 },
      );
    const sha256 = createHash("sha256").update(content).digest("hex");
    const existing = await prisma.tripDocument.findUnique({
      where: { sha256 },
      select: { id: true, extracted: true, containerId: true },
    });
    const previous = existing?.extracted as
      { fields?: { code?: string } } | undefined;
    if (
      existing &&
      (existing.containerId ||
        previous?.fields?.code ||
        !config.ready ||
        manual)
    )
      return NextResponse.json(existing);
    // Shared, persistent limit also applies across serverless instances.
    const bucket = `document-upload:${Math.floor(Date.now() / 3600000)}`;
    const attempts = await prisma.loginAttempt.upsert({
      where: { key: bucket },
      create: {
        key: bucket,
        count: 1,
        expiresAt: new Date(Date.now() + 3600000),
      },
      update: { count: { increment: 1 } },
    });
    if (attempts.count > 30)
      return NextResponse.json(
        { error: "Limite de 30 leituras por hora atingido. Tente mais tarde." },
        { status: 429 },
      );
    const extracted = manual
      ? {
          fields: emptyFields,
          warning:
            "Documento anexado sem envio ao serviço de IA. Preencha e confira os dados da viagem.",
        }
      : await extractDocument(content, mimeType);
    if (existing) {
      await prisma.tripDocument.update({
        where: { id: existing.id },
        data: { extracted },
      });
      return NextResponse.json({ ...existing, extracted });
    }
    const doc = await prisma.tripDocument.create({
      data: {
        filename: file.name.replace(/[\r\n]/g, "").slice(0, 180),
        mimeType,
        content,
        sha256,
        extracted,
      },
      select: { id: true, extracted: true, containerId: true },
    });
    return NextResponse.json(doc, { status: 201 });
  } catch (e) {
    if (e instanceof DocumentExtractionError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    return apiError(e);
  }
}
