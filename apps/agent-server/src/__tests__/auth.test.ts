import { describe, test, expect } from "bun:test";
import type { AuthError as AuthErrorType } from "../auth/middleware.js";

process.env["DB_PATH"] = ":memory:";
process.env["JWT_SECRET"] = "test-secret-at-least-sixteen-chars-long";

const { hash, verify } = await import("../auth/passwords.js");
const { signToken, verifyToken } = await import("../auth/jwt.js");
const { requireAuth, requireRole, AuthError, getAuth } = await import("../auth/middleware.js");
const { handleSignin, handleMe, handleCreateUser, handleChangePassword } = await import("../auth/handlers.js");
const { createUser, createRep, getOrCreateConversation, reassignConversation, listConversations, getConversation } = await import("../db/store.js");

function bearer(token: string): Request {
  return new Request("http://test/", { headers: { Authorization: `Bearer ${token}` } });
}

describe("password hashing", () => {
  test("hash + verify round-trip succeeds", async () => {
    const h = await hash("hunter2");
    expect(await verify("hunter2", h)).toBe(true);
  });

  test("verify rejects wrong password", async () => {
    const h = await hash("hunter2");
    expect(await verify("wrong-password", h)).toBe(false);
  });
});

describe("JWT", () => {
  test("sign + verify round-trip preserves payload", async () => {
    const token = await signToken({ userId: "u_1", username: "alice", role: "admin" });
    const ctx = await verifyToken(token);
    expect(ctx).not.toBeNull();
    expect(ctx?.userId).toBe("u_1");
    expect(ctx?.username).toBe("alice");
    expect(ctx?.role).toBe("admin");
  });

  test("preserves repId when present", async () => {
    const token = await signToken({ userId: "u_2", username: "bob", role: "rep", repId: "rep_xyz" });
    const ctx = await verifyToken(token);
    expect(ctx?.repId).toBe("rep_xyz");
  });

  test("rejects tampered token", async () => {
    const token = await signToken({ userId: "u_1", username: "alice", role: "admin" });
    const tampered = token.slice(0, -4) + "AAAA";
    expect(await verifyToken(tampered)).toBeNull();
  });

  test("rejects garbage token", async () => {
    expect(await verifyToken("not.a.jwt")).toBeNull();
  });
});

describe("middleware", () => {
  test("requireAuth throws 401 without a token", async () => {
    const req = new Request("http://test/");
    await expect(requireAuth(req)).rejects.toBeInstanceOf(AuthError);
  });

  test("requireAuth returns context with a valid token", async () => {
    const token = await signToken({ userId: "u_1", username: "alice", role: "manager" });
    const ctx = await requireAuth(bearer(token));
    expect(ctx.role).toBe("manager");
  });

  test("requireRole returns 403 when role isn't in the allow-list", async () => {
    const token = await signToken({ userId: "u_1", username: "alice", role: "rep" });
    const req = bearer(token);
    let caught: AuthErrorType | null = null;
    try { await requireRole(req, ["admin", "manager"]); }
    catch (e) { caught = e as AuthErrorType; }
    expect(caught).not.toBeNull();
    expect(caught?.status).toBe(403);
  });

  test("requireRole passes when role matches", async () => {
    const token = await signToken({ userId: "u_1", username: "alice", role: "admin" });
    const ctx = await requireRole(bearer(token), ["admin"]);
    expect(ctx.role).toBe("admin");
  });
});

describe("signin handler", () => {
  test("returns token for valid credentials", async () => {
    await createUser("alice", await hash("hunter2"), "admin");
    const res = await handleSignin(
      new Request("http://test/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "alice", password: "hunter2" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; user: { role: string } };
    expect(typeof body.token).toBe("string");
    expect(body.user.role).toBe("admin");
    // Token must round-trip
    const ctx = await verifyToken(body.token);
    expect(ctx?.username).toBe("alice");
  });

  test("rejects unknown username with 401", async () => {
    const res = await handleSignin(
      new Request("http://test/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "nobody", password: "whatever" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test("rejects wrong password with 401", async () => {
    await createUser("bob", await hash("real-password"), "rep");
    const res = await handleSignin(
      new Request("http://test/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "bob", password: "wrong" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test("rejects missing fields with 400", async () => {
    const res = await handleSignin(
      new Request("http://test/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "" }),
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("createUser handler — admin gating", () => {
  test("rejects unauthenticated request with 401", async () => {
    let caught: AuthErrorType | null = null;
    try {
      await handleCreateUser(new Request("http://test/auth/users", { method: "POST", body: "{}" }));
    } catch (e) { caught = e as AuthErrorType; }
    expect(caught?.status).toBe(401);
  });

  test("rejects non-admin role with 403", async () => {
    const token = await signToken({ userId: "u_mgr", username: "manager-mary", role: "manager" });
    let caught: AuthErrorType | null = null;
    try {
      await handleCreateUser(new Request("http://test/auth/users", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ username: "x", password: "abcdef", role: "manager" }),
      }));
    } catch (e) { caught = e as AuthErrorType; }
    expect(caught?.status).toBe(403);
  });

  test("admin can create a rep user", async () => {
    const adminToken = await signToken({ userId: "u_adm", username: "root", role: "admin" });
    const rep = createRep("Test Rep", `test-rep-${Date.now()}@co.com`);
    const res = await handleCreateUser(new Request("http://test/auth/users", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ username: `rep-${Date.now()}`, password: "abcdef", role: "rep", repId: rep.id }),
    }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { role: string; repId: string };
    expect(body.role).toBe("rep");
    expect(body.repId).toBe(rep.id);
  });

  test("rejects role=rep without repId", async () => {
    const adminToken = await signToken({ userId: "u_adm", username: "root", role: "admin" });
    const res = await handleCreateUser(new Request("http://test/auth/users", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ username: `rep-${Date.now()}`, password: "abcdef", role: "rep" }),
    }));
    expect(res.status).toBe(400);
  });

  test("rejects duplicate username with 409", async () => {
    await createUser("duplicate", await hash("abcdef"), "manager");
    const adminToken = await signToken({ userId: "u_adm", username: "root", role: "admin" });
    const res = await handleCreateUser(new Request("http://test/auth/users", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ username: "duplicate", password: "abcdef", role: "manager" }),
    }));
    expect(res.status).toBe(409);
  });

  test("rejects invalid role string with 400", async () => {
    const adminToken = await signToken({ userId: "u_adm", username: "root", role: "admin" });
    const res = await handleCreateUser(new Request("http://test/auth/users", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ username: `bad-${Date.now()}`, password: "abcdef", role: "superuser" }),
    }));
    expect(res.status).toBe(400);
  });

  test("rejects short password (< 6 chars) with 400", async () => {
    const adminToken = await signToken({ userId: "u_adm", username: "root", role: "admin" });
    const res = await handleCreateUser(new Request("http://test/auth/users", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ username: `short-${Date.now()}`, password: "abc", role: "manager" }),
    }));
    expect(res.status).toBe(400);
  });

  test("rejects role=rep with non-existent repId with 400", async () => {
    const adminToken = await signToken({ userId: "u_adm", username: "root", role: "admin" });
    const res = await handleCreateUser(new Request("http://test/auth/users", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ username: `ghost-${Date.now()}`, password: "abcdef", role: "rep", repId: "rep_does_not_exist" }),
    }));
    expect(res.status).toBe(400);
  });

  test("admin can create a manager user (no repId)", async () => {
    const adminToken = await signToken({ userId: "u_adm", username: "root", role: "admin" });
    const username = `mgr-${Date.now()}`;
    const res = await handleCreateUser(new Request("http://test/auth/users", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: "abcdef", role: "manager" }),
    }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { role: string; repId?: string };
    expect(body.role).toBe("manager");
    expect(body.repId).toBeUndefined();
  });
});

// ── /auth/me handler ────────────────────────────────────────────────────────────

describe("me handler", () => {
  test("returns user record for a valid token", async () => {
    const created = createUser(`me-test-${Date.now()}`, await hash("abcdef"), "manager");
    const token = await signToken({ userId: created.id, username: created.username, role: "manager" });
    const res = await handleMe(new Request("http://test/auth/me", { headers: { Authorization: `Bearer ${token}` } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; username: string; role: string; passwordHash?: string };
    expect(body.id).toBe(created.id);
    expect(body.role).toBe("manager");
    // Critical: must never leak the password hash
    expect(body.passwordHash).toBeUndefined();
  });

  test("returns repId for a rep user", async () => {
    const rep = createRep("Me Test Rep", `me-rep-${Date.now()}@co.com`);
    const created = createUser(`me-rep-user-${Date.now()}`, await hash("abcdef"), "rep", rep.id);
    const token = await signToken({ userId: created.id, username: created.username, role: "rep", repId: rep.id });
    const res = await handleMe(new Request("http://test/auth/me", { headers: { Authorization: `Bearer ${token}` } }));
    const body = (await res.json()) as { repId: string };
    expect(body.repId).toBe(rep.id);
  });

  test("rejects unauthenticated request with 401", async () => {
    let caught: AuthErrorType | null = null;
    try { await handleMe(new Request("http://test/auth/me")); }
    catch (e) { caught = e as AuthErrorType; }
    expect(caught?.status).toBe(401);
  });

  test("rejects token for a user no longer in DB with 401", async () => {
    // Sign a token for a userId that doesn't exist in the DB
    const orphan = await signToken({ userId: "user_does_not_exist", username: "ghost", role: "admin" });
    let caught: AuthErrorType | null = null;
    try { await handleMe(new Request("http://test/auth/me", { headers: { Authorization: `Bearer ${orphan}` } })); }
    catch (e) { caught = e as AuthErrorType; }
    expect(caught?.status).toBe(401);
  });
});

// ── Bearer-header parsing in getAuth ────────────────────────────────────────────

describe("getAuth header parsing", () => {
  test("returns null when Authorization header is missing", async () => {
    expect(await getAuth(new Request("http://test/"))).toBeNull();
  });

  test("returns null for non-Bearer scheme", async () => {
    expect(await getAuth(new Request("http://test/", { headers: { Authorization: "Basic abc:def" } }))).toBeNull();
  });

  test("returns null for empty token after 'Bearer '", async () => {
    expect(await getAuth(new Request("http://test/", { headers: { Authorization: "Bearer    " } }))).toBeNull();
  });

  test("returns null for garbage token", async () => {
    expect(await getAuth(new Request("http://test/", { headers: { Authorization: "Bearer not.a.real.jwt" } }))).toBeNull();
  });
});

// ── Query scoping (the rep-can't-see-others security boundary) ──────────────────

describe("conversation scopeToRepId", () => {
  test("listConversations with scope returns only the rep's conversations", async () => {
    const repA = createRep("Scope Rep A", `scope-a-${Date.now()}@co.com`);
    const repB = createRep("Scope Rep B", `scope-b-${Date.now()}@co.com`);
    const convA = await getOrCreateConversation(`scope_thread_a_${Date.now()}`, "leadA@co.com");
    const convB = await getOrCreateConversation(`scope_thread_b_${Date.now()}`, "leadB@co.com");
    await reassignConversation(convA.id, repA.id);
    await reassignConversation(convB.id, repB.id);

    const repAList = listConversations(undefined, repA.id);
    expect(repAList.every(c => c.assignedRepId === repA.id)).toBe(true);
    expect(repAList.some(c => c.id === convA.id)).toBe(true);
    expect(repAList.some(c => c.id === convB.id)).toBe(false);

    const repBList = listConversations(undefined, repB.id);
    expect(repBList.some(c => c.id === convB.id)).toBe(true);
    expect(repBList.some(c => c.id === convA.id)).toBe(false);
  });

  test("listConversations with no scope returns all", async () => {
    const all = listConversations();
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  test("getConversation with matching scope returns the conversation", async () => {
    const rep = createRep("Scope Rep C", `scope-c-${Date.now()}@co.com`);
    const conv = await getOrCreateConversation(`scope_thread_c_${Date.now()}`, "leadC@co.com");
    await reassignConversation(conv.id, rep.id);
    const fetched = getConversation(conv.id, rep.id);
    expect(fetched?.id).toBe(conv.id);
  });

  test("getConversation with non-matching scope returns null (not 403 — don't leak existence)", async () => {
    const repOwner = createRep("Owner Rep", `owner-${Date.now()}@co.com`);
    const repIntruder = createRep("Intruder Rep", `intruder-${Date.now()}@co.com`);
    const conv = await getOrCreateConversation(`scope_thread_priv_${Date.now()}`, "private@co.com");
    await reassignConversation(conv.id, repOwner.id);

    expect(getConversation(conv.id, repIntruder.id)).toBeNull();
  });

  test("getConversation for an unassigned conversation with rep scope returns null", async () => {
    const rep = createRep("Lonely Rep", `lonely-${Date.now()}@co.com`);
    const conv = await getOrCreateConversation(`scope_thread_unassigned_${Date.now()}`, "noone@co.com");
    // Note: getOrCreateConversation auto-assigns via round-robin, so explicitly null it out
    await reassignConversation(conv.id, ""); // sets assignedRepId to ''
    expect(getConversation(conv.id, rep.id)).toBeNull();
  });

  test("getConversation for a non-existent id returns null with or without scope", async () => {
    expect(getConversation("conv_does_not_exist")).toBeNull();
    expect(getConversation("conv_does_not_exist", "rep_anything")).toBeNull();
  });
});

// ── Change password ─────────────────────────────────────────────────────────────

describe("changePassword handler", () => {
  async function authedReq(token: string, body: unknown): Promise<Request> {
    return new Request("http://test/auth/me/password", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  test("changes the password when current is correct", async () => {
    const created = createUser(`pw-good-${Date.now()}`, await hash("oldpassword"), "manager");
    const token = await signToken({ userId: created.id, username: created.username, role: "manager" });
    const res = await handleChangePassword(await authedReq(token, { currentPassword: "oldpassword", newPassword: "newpassword" }));
    expect(res.status).toBe(200);
    // Verify the new password works for signin
    const signin = await handleSignin(new Request("http://test/auth/signin", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: created.username, password: "newpassword" }),
    }));
    expect(signin.status).toBe(200);
  });

  test("rejects when current password is wrong (401)", async () => {
    const created = createUser(`pw-wrong-${Date.now()}`, await hash("realpassword"), "manager");
    const token = await signToken({ userId: created.id, username: created.username, role: "manager" });
    const res = await handleChangePassword(await authedReq(token, { currentPassword: "guessing", newPassword: "newpassword" }));
    expect(res.status).toBe(401);
  });

  test("rejects when new password is too short (400)", async () => {
    const created = createUser(`pw-short-${Date.now()}`, await hash("oldpassword"), "manager");
    const token = await signToken({ userId: created.id, username: created.username, role: "manager" });
    const res = await handleChangePassword(await authedReq(token, { currentPassword: "oldpassword", newPassword: "abc" }));
    expect(res.status).toBe(400);
  });

  test("rejects when new password equals current (400)", async () => {
    const created = createUser(`pw-same-${Date.now()}`, await hash("samepassword"), "manager");
    const token = await signToken({ userId: created.id, username: created.username, role: "manager" });
    const res = await handleChangePassword(await authedReq(token, { currentPassword: "samepassword", newPassword: "samepassword" }));
    expect(res.status).toBe(400);
  });

  test("rejects unauthenticated request with 401", async () => {
    let caught: AuthErrorType | null = null;
    try { await handleChangePassword(new Request("http://test/auth/me/password", { method: "POST", body: "{}" })); }
    catch (e) { caught = e as AuthErrorType; }
    expect(caught?.status).toBe(401);
  });
});
