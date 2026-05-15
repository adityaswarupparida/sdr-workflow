import { verifyToken } from "./jwt.js";
import type { AuthContext, UserRole } from "../types/index.js";

/** Extracts and validates the bearer token. Returns null when missing/invalid. */
export async function getAuth(req: Request): Promise<AuthContext | null> {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  if (!token) return null;
  return verifyToken(token);
}

export class AuthError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Throws 401 if unauthenticated. */
export async function requireAuth(req: Request): Promise<AuthContext> {
  const ctx = await getAuth(req);
  if (!ctx) throw new AuthError(401, "Unauthorized");
  return ctx;
}

/** Throws 401 if unauthenticated, 403 if role not allowed. */
export async function requireRole(req: Request, allowed: UserRole[]): Promise<AuthContext> {
  const ctx = await requireAuth(req);
  if (!allowed.includes(ctx.role)) throw new AuthError(403, "Forbidden");
  return ctx;
}
