import { NextResponse } from "next/server";
import { adminRequestError } from "@/lib/admin-request";

export const maxDuration = 60;

// Admin-only connectivity probe: minimal text prompt, no document bytes.
// Used to isolate network/key/model issues from large-payload slowness.
export async function GET(req: Request) {
  const unauthorized = await adminRequestError(req);
  if (unauthorized) return unauthorized;
  const model = (process.env.GEMINI_DOCUMENT_MODEL || "gemini-2.5-flash").trim();
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey || !model)
    return NextResponse.json({ ok: false, stage: "config" }, { status: 503 });
  const started = Date.now();
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: "Responda apenas: OK" }] },
          ],
          generationConfig: { temperature: 0, maxOutputTokens: 16 },
        }),
      },
    );
    return NextResponse.json({
      ok: response.ok,
      stage: "http",
      httpStatus: response.status,
      latencyMs: Date.now() - started,
      model,
    });
  } catch (error) {
    const timedOut =
      error instanceof DOMException && error.name === "TimeoutError";
    return NextResponse.json(
      {
        ok: false,
        stage: timedOut ? "timeout" : "transport",
        latencyMs: Date.now() - started,
        model,
      },
      { status: 504 },
    );
  }
}
