import { NextResponse } from "next/server";
import { COOKIE, validSession } from "./session";

export async function adminRequestError(req: Request) {
  const token = req.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(COOKIE + "="))
    ?.slice(COOKIE.length + 1);
  if (!(await validSession(token)))
    return NextResponse.json({ error: "Entre na sua conta" }, { status: 401 });
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin)
    return NextResponse.json(
      { error: "Origem não permitida" },
      { status: 403 },
    );
  return null;
}
