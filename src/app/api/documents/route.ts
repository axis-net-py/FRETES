import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { detectDocumentType, emptyFields } from "@/lib/document-fields";
import {
  extractDocument,
  DocumentExtractionError,
  shouldReExtract,
  type DocumentExtraction,
  documentPromptVersion,
} from "@/lib/document-extraction";
import {
  repairTripsFromText,
  fallbackExtractFromPdfText,
} from "@/lib/document-pdf";
import { documentProvider } from "@/lib/document-provider";
import { apiError } from "@/lib/api";

async function extractPdfText(content: Buffer): Promise<string> {
  try {
    const { extractText } = await import("unpdf");
    const res = await extractText(new Uint8Array(content), { mergePages: true });
    if (res?.text && res.text.trim()) {
      return res.text.trim();
    }
  } catch (err) {
    console.error("[documents] unpdf extractText error:", err);
  }
  try {
    const { PDFParse } = await import("pdf-parse");
    if (typeof PDFParse === "function") {
      const parser = new PDFParse({ data: new Uint8Array(content) });
      const res = await parser.getText();
      return (res.text || "").trim();
    }
  } catch (err) {
    console.error("[documents] pdf-parse fallback error:", err);
  }
  return "";
}

async function repairFromPdfText(
  content: Buffer,
  mimeType: string,
  extracted: DocumentExtraction,
): Promise<DocumentExtraction> {
  if (mimeType !== "application/pdf") return extracted;
  const text = await extractPdfText(content);
  if (!text) return extracted;
  return { ...extracted, trips: repairTripsFromText(extracted.trips, text) };
}
export const maxDuration = 60;
const documentLinksSelect = {
  select: {
    containerId: true,
    container: { select: { code: true } },
  },
};
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
        extracted: true,
        links: documentLinksSelect,
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
    if (!config.ready)
      return NextResponse.json(
        { error: "A leitura automática não está configurada." },
        { status: 503 },
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
      select: { id: true, extracted: true, links: documentLinksSelect },
    });
    // Re-read files stored under older instructions; linked freights keep theirs.
    if (existing && !shouldReExtract(existing.extracted, existing.links.length))
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
    let extracted: DocumentExtraction;
    try {
      extracted = await extractDocument(content, mimeType);
    } catch (error) {
      console.warn("[documents] AI extraction failed, falling back to local extraction:", error);
      let text = "";
      if (mimeType === "application/pdf") {
        text = await extractPdfText(content);
      }
      if (text) {
        const fallbackTrips = fallbackExtractFromPdfText(text);
        extracted = {
          promptVersion: documentPromptVersion,
          trips: fallbackTrips.length
            ? fallbackTrips
            : [
                {
                  fields: emptyFields,
                  warning:
                    "Cota do Gemini indisponível no Google AI Studio. Preencha os campos abaixo para salvar o frete.",
                },
              ],
          warning:
            "Leitura direta do texto do documento realizada com sucesso (cota do Gemini atingida). Confira os campos antes de confirmar.",
        };
      } else {
        extracted = {
          promptVersion: documentPromptVersion,
          trips: [
            {
              fields: emptyFields,
              warning:
                "Cota da IA atingida no Google AI Studio. Os campos foram liberados para preenchimento manual.",
            },
          ],
          warning:
            "Cota da IA atingida no Google AI Studio. Preencha os campos do frete manualmente para cadastrar.",
        };
      }
    }
    extracted = await repairFromPdfText(content, mimeType, extracted);
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
      select: { id: true, extracted: true, links: documentLinksSelect },
    });
    return NextResponse.json(doc, { status: 201 });
  } catch (e) {
    if (e instanceof DocumentExtractionError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    return apiError(e);
  }
}
