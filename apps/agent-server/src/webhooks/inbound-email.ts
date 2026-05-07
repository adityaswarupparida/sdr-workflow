import { parseInboundEmail } from "../integrations/email/client.js";
import { runSdrAgent } from "../agent/sdr-agent.js";
import type { InboundEmailWebhook } from "../integrations/email/types.js";
import type { AgentOutcome } from "../types/index.js";

export async function handleInboundEmail(body: unknown): Promise<AgentOutcome> {
  const raw = body as InboundEmailWebhook;

  if (!raw.from || !raw.subject || !raw.body) {
    throw new Error("Invalid webhook payload: missing from, subject, or body");
  }

  const inbound = parseInboundEmail(raw);
  console.log(`[Webhook] Inbound email from ${inbound.from} — "${inbound.subject}"`);

  return runSdrAgent(inbound);
}
