import { SignJWT, jwtVerify } from "jose";
import type { AuthContext } from "../types/index.js";

const TOKEN_TTL = "24h";
const ALG = "HS256";

function getSecret(): Uint8Array {
  const secret = process.env["JWT_SECRET"];
  if (!secret || secret.length < 16) {
    throw new Error("JWT_SECRET not configured (must be at least 16 chars)");
  }
  return new TextEncoder().encode(secret);
}

export async function signToken(ctx: AuthContext): Promise<string> {
  return new SignJWT({ ...ctx })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<AuthContext | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: [ALG] });
    if (typeof payload["userId"] !== "string" || typeof payload["username"] !== "string" || typeof payload["role"] !== "string") {
      return null;
    }
    return {
      userId: payload["userId"],
      username: payload["username"],
      role: payload["role"] as AuthContext["role"],
      repId: typeof payload["repId"] === "string" ? payload["repId"] : undefined,
    };
  } catch {
    return null;
  }
}
