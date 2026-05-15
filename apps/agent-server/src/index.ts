import { handleInboundEmail } from "./webhooks/inbound-email.js";
import { listConversations, getConversation, approveDraft, saveCustomReply, reassignConversation,
         listReps, getRep, createRep, updateRep, deleteRep } from "./db/store.js";
import { seedReps } from "./db/seed.js";
import { startFollowupWorker } from "./queue/followup.worker.js";
import * as email from "./integrations/email/client.js";
import * as hubspot from "./integrations/hubspot/client.js";
import { handleSignin, handleMe, handleCreateUser, handleChangePassword } from "./auth/handlers.js";
import { requireAuth, requireRole, AuthError } from "./auth/middleware.js";
import { seedAdmin } from "./auth/seed.js";
import type { AuthContext } from "./types/index.js";

seedReps();
await seedAdmin();

// Only start follow-up worker when REDIS_URL is explicitly configured
if (process.env["REDIS_URL"]) {
  const worker = startFollowupWorker();
  worker.on("error", (err) => {
    console.warn("[Worker] Redis error (follow-ups paused):", err.message);
  });
} else {
  console.log("[Worker] REDIS_URL not set — follow-up scheduling disabled");
}

const PORT = process.env["PORT"] ? parseInt(process.env["PORT"]) : 3001;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

function corsHeaders(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

/** Conversations are visible to reps only if they're the assigned rep. */
function repScope(ctx: AuthContext): string | undefined {
  return ctx.role === "rep" ? ctx.repId : undefined;
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const method = req.method;

    if (method === "OPTIONS") return corsHeaders();

    try {
      // ── Webhooks (no auth — gated by webhook secret) ──────────────────────────
      if (method === "POST" && url.pathname === "/webhooks/email") {
        try {
          const body = await req.json();
          const outcome = await handleInboundEmail(body, url);
          return json({ success: true, outcome });
        } catch (err) {
          const msg = String(err);
          const status = msg.includes("Unauthorized") ? 401 : 400;
          console.error("[Webhook] Error:", err);
          return json({ error: msg }, status);
        }
      }

      // ── Health (no auth) ──────────────────────────────────────────────────────
      if (method === "GET" && url.pathname === "/health") {
        return json({ status: "ok", port: PORT });
      }

      // ── Auth ──────────────────────────────────────────────────────────────────
      // (await so AuthError rejections are caught by the outer try/catch)
      if (method === "POST" && url.pathname === "/auth/signin")        return await handleSignin(req);
      if (method === "GET"  && url.pathname === "/auth/me")            return await handleMe(req);
      if (method === "POST" && url.pathname === "/auth/me/password")   return await handleChangePassword(req);
      if (method === "POST" && url.pathname === "/auth/users")         return await handleCreateUser(req);

      // ── Sales Reps ────────────────────────────────────────────────────────────

      if (method === "GET" && url.pathname === "/reps") {
        await requireAuth(req);
        return json(listReps());
      }

      if (method === "POST" && url.pathname === "/reps") {
        await requireRole(req, ["admin", "manager"]);
        const body = (await req.json()) as { name: string; email: string };
        if (!body.name || !body.email) return json({ error: "name and email are required" }, 400);
        const rep = createRep(body.name, body.email);
        return json(rep, 201);
      }

      const repMatch = url.pathname.match(/^\/reps\/([^/]+)$/);

      if (repMatch) {
        const repId = repMatch[1]!;

        if (method === "GET") {
          await requireAuth(req);
          const rep = getRep(repId);
          return rep ? json(rep) : json({ error: "Not found" }, 404);
        }

        if (method === "PUT") {
          await requireRole(req, ["admin", "manager"]);
          const body = (await req.json()) as Partial<{ name: string; email: string; isActive: boolean }>;
          const rep = updateRep(repId, body);
          return rep ? json(rep) : json({ error: "Not found" }, 404);
        }

        if (method === "DELETE") {
          await requireRole(req, ["admin", "manager"]);
          deleteRep(repId);
          return json({ success: true });
        }
      }

      // ── Conversations ─────────────────────────────────────────────────────────

      if (method === "GET" && url.pathname === "/conversations") {
        const ctx = await requireAuth(req);
        const status = url.searchParams.get("status") ?? undefined;
        return json(listConversations(status, repScope(ctx)));
      }

      const convDetailMatch = url.pathname.match(/^\/conversations\/([^/]+)$/);
      if (method === "GET" && convDetailMatch) {
        const ctx = await requireAuth(req);
        const conversation = getConversation(convDetailMatch[1]!, repScope(ctx));
        return conversation ? json(conversation) : json({ error: "Not found" }, 404);
      }

      const approveMatch = url.pathname.match(/^\/conversations\/([^/]+)\/approve$/);
      if (method === "POST" && approveMatch) {
        const ctx = await requireAuth(req);
        const id = approveMatch[1]!;
        const conversation = getConversation(id, repScope(ctx));
        if (!conversation) return json({ error: "Not found" }, 404);
        if (conversation.status !== "pending_review") return json({ error: "Conversation is not pending review" }, 400);

        const draft = await approveDraft(id);
        if (!draft) return json({ error: "No draft to approve" }, 400);

        const cc = conversation.assignedRep ? [conversation.assignedRep.email] : undefined;
        const sent = await email.sendEmail({ to: conversation.leadEmail, subject: "Re: Follow-up", body: draft, cc });
        const hs = await hubspot.getContactByEmail(conversation.leadEmail);
        if (hs) await hubspot.logEmailActivity(hs.id, "Re: Follow-up (approved)", draft);

        return json({ success: true, messageId: sent.messageId });
      }

      const replyMatch = url.pathname.match(/^\/conversations\/([^/]+)\/reply$/);
      if (method === "POST" && replyMatch) {
        const ctx = await requireAuth(req);
        const id = replyMatch[1]!;
        const conversation = getConversation(id, repScope(ctx));
        if (!conversation) return json({ error: "Not found" }, 404);

        const body = (await req.json()) as { subject?: string; body: string };
        if (!body.body) return json({ error: "body is required" }, 400);

        const cc = conversation.assignedRep ? [conversation.assignedRep.email] : undefined;
        const sent = await email.sendEmail({
          to: conversation.leadEmail,
          subject: body.subject ?? "Re: Your inquiry",
          body: body.body,
          cc,
        });
        await saveCustomReply(id, body.body);
        const hs = await hubspot.getContactByEmail(conversation.leadEmail);
        if (hs) await hubspot.logEmailActivity(hs.id, body.subject ?? "Re: Your inquiry (manual)", body.body);

        return json({ success: true, messageId: sent.messageId });
      }

      const reassignMatch = url.pathname.match(/^\/conversations\/([^/]+)\/reassign$/);
      if (method === "POST" && reassignMatch) {
        await requireRole(req, ["admin", "manager"]);
        const id = reassignMatch[1]!;
        const conversation = getConversation(id);
        if (!conversation) return json({ error: "Not found" }, 404);
        const body = (await req.json()) as { repId: string };
        if (!body.repId) return json({ error: "repId is required" }, 400);
        const rep = getRep(body.repId);
        if (!rep) return json({ error: "Rep not found" }, 404);
        await reassignConversation(id, body.repId);
        console.log(`[Reassign] Conversation ${id} → ${rep.name} <${rep.email}>`);
        return json({ success: true, assignedRep: rep });
      }

      return json({ error: "Not found" }, 404);
    } catch (err) {
      if (err instanceof AuthError) {
        return json({ error: err.message }, err.status);
      }
      console.error("[Server] Unhandled error:", err);
      return json({ error: "Internal server error" }, 500);
    }
  },
});

console.log(`[agent-server] Listening on http://localhost:${PORT}`);
