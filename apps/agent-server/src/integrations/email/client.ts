import nodemailer from "nodemailer";
import type { SendEmailParams, SendEmailResult, InboundEmailWebhook, PostmarkInboundPayload } from "./types.js";
import type { InboundEmail } from "../../types/index.js";

const GMAIL_USER = process.env["GMAIL_USER"];
const GMAIL_APP_PASSWORD = process.env["GMAIL_APP_PASSWORD"];

function isConfigured(): boolean {
  return Boolean(GMAIL_USER && GMAIL_APP_PASSWORD);
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });
  }
  return transporter;
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const sentAt = new Date().toISOString();

  if (isConfigured()) {
    const info = await getTransporter().sendMail({
      from: `SDR Agent <${GMAIL_USER}>`,
      to: params.to,
      cc: params.cc?.join(", "),
      subject: params.subject,
      text: params.body,
      ...(params.replyToMessageId && { inReplyTo: params.replyToMessageId, references: params.replyToMessageId }),
    });

    console.log(`[Email] SENT via Gmail → ${params.to}${params.cc?.length ? ` (CC: ${params.cc.join(", ")})` : ""}`);
    return { messageId: info.messageId, sentAt };
  }

  // Mock fallback when Gmail credentials are not set
  const messageId = `mock_${Date.now()}`;
  console.log(`[Email] MOCK SENT → ${params.to}${params.cc?.length ? ` (CC: ${params.cc.join(", ")})` : ""}`);
  console.log(`  Subject: ${params.subject}`);
  console.log(`  Body: ${params.body.slice(0, 120)}...`);
  return { messageId, sentAt };
}

// ── Inbound parsers (Postmark handles inbound, nodemailer handles outbound) ───

export function parsePostmarkInbound(raw: PostmarkInboundPayload): InboundEmail {
  const inReplyTo = raw.Headers.find((h) => h.Name === "In-Reply-To")?.Value?.trim();
  const references = raw.Headers.find((h) => h.Name === "References")?.Value?.trim().split(/\s+/)[0];
  const threadId = inReplyTo ?? references ?? raw.MessageID;

  return {
    from: raw.From,
    subject: raw.Subject,
    body: raw.TextBody,
    threadId,
    messageId: raw.MessageID,
    receivedAt: raw.Date ? new Date(raw.Date).toISOString() : new Date().toISOString(),
  };
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
