import type { SendEmailParams, SendEmailResult, InboundEmailWebhook } from "./types.js";
import type { InboundEmail } from "../../types/index.js";

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const messageId = `msg_${Date.now()}`;
  const sentAt = new Date().toISOString();
  // Replace with nodemailer / SendGrid / Postmark when going real
  console.log(`[Email] SENT → ${params.to}${params.cc?.length ? ` (CC: ${params.cc.join(", ")})` : ""}`);
  console.log(`  Subject: ${params.subject}`);
  console.log(`  Body: ${params.body.slice(0, 120)}...`);
  return { messageId, sentAt };
}

export function parseInboundEmail(raw: InboundEmailWebhook): InboundEmail {
  return {
    from: raw.from,
    subject: raw.subject,
    body: raw.body,
    threadId: raw.threadId ?? `thread_${Date.now()}`,
    messageId: raw.messageId ?? `msg_in_${Date.now()}`,
    receivedAt: new Date().toISOString(),
  };
}
