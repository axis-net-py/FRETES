import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";
export const COOKIE = "fretes-session";
function key() {
  if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET ausente");
  return new TextEncoder().encode(process.env.SESSION_SECRET);
}
export async function createSession() {
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(key());
}
export async function validSession(token?: string) {
  try {
    if (!token) return false;
    const { payload } = await jwtVerify(token, key(), {
      algorithms: ["HS256"],
    });
    return payload.role === "admin";
  } catch {
    return false;
  }
}
