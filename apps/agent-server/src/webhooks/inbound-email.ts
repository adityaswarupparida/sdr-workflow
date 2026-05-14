import { parseInboundEmail, parsePostmarkInbound } from "../integrations/email/client.js";
import { runSdrAgent } from "../agent/sdr-agent.js";
import type { PostmarkInboundPayload } from "../integrations/email/types.js";
import type { AgentOutcome, InboundEmail } from "../types/index.js";

function isPostmarkPayload(body: unknown): body is PostmarkInboundPayload {
  const b = body as Record<string, unknown>;
  // Postmark uses capitalised keys: From, Subject, TextBody, MessageID
  return typeof b["From"] === "string" && typeof b["MessageID"] === "string" && typeof b["TextBody"] === "string";
}

export function validateWebhookSecret(url: URL): boolean {
  const secret = process.env["WEBHOOK_SECRET"];
  if (!secret) return true; // not configured — allow all (dev mode)
  return url.searchParams.get("secret") === secret;
}

export async function handleInboundEmail(body: unknown, requestUrl?: URL): Promise<AgentOutcome> {
  if (requestUrl && !validateWebhookSecret(requestUrl)) {
    throw new Error("Unauthorized: invalid webhook secret");
  }

  let inbound: InboundEmail;

  if (isPostmarkPayload(body)) {
    inbound = parsePostmarkInbound(body);
  } else {
    const raw = body as { from?: string; subject?: string; body?: string };
    if (!raw.from || !raw.subject || !raw.body) {
      throw new Error("Invalid webhook payload: missing from, subject, or body");
    }
    inbound = parseInboundEmail(raw as Parameters<typeof parseInboundEmail>[0]);
  }

  console.log(`[Webhook] Inbound email from ${inbound.from} — "${inbound.subject}" (thread: ${inbound.threadId})`);
  return runSdrAgent(inbound);
}
