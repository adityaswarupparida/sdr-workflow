import { createUser, getUserById, getUserByUsername, getRep } from "../db/store.js";
import { hash, verify } from "./passwords.js";
import { signToken } from "./jwt.js";
import { requireAuth, requireRole, AuthError } from "./middleware.js";
import type { UserRole } from "../types/index.js";

const VALID_ROLES: UserRole[] = ["admin", "manager", "rep"];

export async function handleSignin(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { username?: unknown; password?: unknown };
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || !password) {
    return json({ error: "username and password are required" }, 400);
  }

  const user = getUserByUsername(username);
  // Always run a verify (even on missing user) to avoid leaking which usernames exist via timing.
  const ok = user
    ? await verify(password, user.passwordHash)
    : await verify(password, "$argon2id$v=19$m=65536,t=2,p=1$abc$def").catch(() => false);
  if (!user || !ok) {
    return json({ error: "Invalid credentials" }, 401);
  }

  const token = await signToken({
    userId: user.id,
    username: user.username,
    role: user.role,
    repId: user.repId,
  });

  return json({
    token,
    user: { id: user.id, username: user.username, role: user.role, repId: user.repId, createdAt: user.createdAt },
  });
}

export async function handleMe(req: Request): Promise<Response> {
  const ctx = await requireAuth(req);
  const user = getUserById(ctx.userId);
  if (!user) throw new AuthError(401, "User no longer exists");
  return json(user);
}

export async function handleCreateUser(req: Request): Promise<Response> {
  await requireRole(req, ["admin"]);
  const body = (await req.json().catch(() => ({}))) as {
    username?: unknown; password?: unknown; role?: unknown; repId?: unknown;
  };
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const role = typeof body.role === "string" ? body.role : "";
  const repId = typeof body.repId === "string" && body.repId ? body.repId : undefined;

  if (!username || password.length < 6) {
    return json({ error: "username and password (min 6 chars) are required" }, 400);
  }
  if (!VALID_ROLES.includes(role as UserRole)) {
    return json({ error: `role must be one of ${VALID_ROLES.join(", ")}` }, 400);
  }
  if (role === "rep" && !repId) {
    return json({ error: "repId is required when role is 'rep'" }, 400);
  }
  if (repId && !getRep(repId)) {
    return json({ error: "repId does not match any sales rep" }, 400);
  }
  if (getUserByUsername(username)) {
    return json({ error: "username already exists" }, 409);
  }

  const user = createUser(username, await hash(password), role as UserRole, repId);
  return json(user, 201);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
