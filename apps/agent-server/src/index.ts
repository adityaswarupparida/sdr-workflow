import { handleInboundEmail } from "./webhooks/inbound-email.js";
import { listConversations, getConversation, approveDraft, saveCustomReply } from "./db/store.js";
import * as email from "./integrations/email/client.js";
import * as hubspot from "./integrations/hubspot/client.js";

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
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const method = req.method;

    if (method === "OPTIONS") return corsHeaders();

    // POST /webhooks/email — inbound email trigger
    if (method === "POST" && url.pathname === "/webhooks/email") {
      try {
        const body = await req.json();
        const outcome = await handleInboundEmail(body);
        return json({ success: true, outcome });
      } catch (err) {
        console.error("[Webhook] Error:", err);
        return json({ error: String(err) }, 400);
      }
    }

    // GET /conversations — list all, optionally filtered by ?status=
    if (method === "GET" && url.pathname === "/conversations") {
      const status = url.searchParams.get("status") ?? undefined;
      const conversations = listConversations(status);
      return json(conversations);
    }

    // GET /conversations/:id — full conversation detail
    const convDetailMatch = url.pathname.match(/^\/conversations\/([^/]+)$/);
    if (method === "GET" && convDetailMatch) {
      const id = convDetailMatch[1]!;
      const conversation = getConversation(id);
      if (!conversation) return json({ error: "Not found" }, 404);
      return json(conversation);
    }

    // POST /conversations/:id/approve — human approves draft, sends email
    const approveMatch = url.pathname.match(/^\/conversations\/([^/]+)\/approve$/);
    if (method === "POST" && approveMatch) {
      const id = approveMatch[1]!;
      const conversation = getConversation(id);
      if (!conversation) return json({ error: "Not found" }, 404);
      if (conversation.status !== "pending_review") return json({ error: "Conversation is not pending review" }, 400);

      const draft = await approveDraft(id);
      if (!draft) return json({ error: "No draft to approve" }, 400);

      const sent = await email.sendEmail({ to: conversation.leadEmail, subject: "Re: Follow-up", body: draft });
      const hs = hubspot.getContactByEmail(conversation.leadEmail);
      if (hs) await hubspot.logEmailActivity(hs.id, "Re: Follow-up (approved)", draft);

      return json({ success: true, messageId: sent.messageId });
    }

    // POST /conversations/:id/reply — human sends custom reply (override)
    const replyMatch = url.pathname.match(/^\/conversations\/([^/]+)\/reply$/);
    if (method === "POST" && replyMatch) {
      const id = replyMatch[1]!;
      const conversation = getConversation(id);
      if (!conversation) return json({ error: "Not found" }, 404);

      const body = (await req.json()) as { subject?: string; body: string };
      if (!body.body) return json({ error: "body is required" }, 400);

      const sent = await email.sendEmail({
        to: conversation.leadEmail,
        subject: body.subject ?? "Re: Your inquiry",
        body: body.body,
      });
      await saveCustomReply(id, body.body);

      const hs = hubspot.getContactByEmail(conversation.leadEmail);
      if (hs) await hubspot.logEmailActivity(hs.id, body.subject ?? "Re: Your inquiry (manual)", body.body);

      return json({ success: true, messageId: sent.messageId });
    }

    // POST /conversations/:id/reassign — update escalation assignment (metadata only for now)
    const reassignMatch = url.pathname.match(/^\/conversations\/([^/]+)\/reassign$/);
    if (method === "POST" && reassignMatch) {
      const id = reassignMatch[1]!;
      const conversation = getConversation(id);
      if (!conversation) return json({ error: "Not found" }, 404);
      const body = (await req.json()) as { assignedTo: string };
      console.log(`[Reassign] Conversation ${id} → ${body.assignedTo}`);
      return json({ success: true, conversationId: id, assignedTo: body.assignedTo });
    }

    // Health check
    if (method === "GET" && url.pathname === "/health") {
      return json({ status: "ok", port: PORT });
    }

    return json({ error: "Not found" }, 404);
  },
});

console.log(`[agent-server] Listening on http://localhost:${PORT}`);
