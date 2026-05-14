import { sendEmail } from "../integrations/email/client.js";
import type { EscalationReason, SalesRep } from "../types/index.js";

const REASON_LABELS: Record<EscalationReason, string> = {
  pricing_or_quote: "Pricing / Quote",
  technical_deep_dive: "Technical Deep Dive",
  existing_customer: "Existing Customer",
  legal_or_contract: "Legal / Contract",
  low_confidence: "Low Confidence",
};

interface EmailNotificationParams {
  conversationId: string;
  leadEmail: string;
  reason: EscalationReason;
  urgency: "low" | "high";
  assignedRep: SalesRep;
  draftReply?: string;
}

export async function sendEmailEscalationNotification(params: EmailNotificationParams): Promise<void> {
  const dashboardUrl = process.env["DASHBOARD_URL"] ?? "http://localhost:3000";
  const convUrl = `${dashboardUrl}/conversations/${params.conversationId}`;
  const reasonLabel = REASON_LABELS[params.reason];

  const subject = `[SDR Alert] Escalation needs your review — ${reasonLabel}`;

  const body = [
    `Hi ${params.assignedRep.name},`,
    ``,
    `The SDR agent has escalated a conversation that needs your attention.`,
    ``,
    `Lead:        ${params.leadEmail}`,
    `Reason:      ${reasonLabel}`,
    `Urgency:     ${params.urgency === "high" ? "High" : "Normal"}`,
    ``,
    params.draftReply
      ? `The agent drafted a reply for you to review:\n\n${params.draftReply}\n`
      : `No draft was provided — you'll need to write a reply from scratch.\n`,
    `Review and send here: ${convUrl}`,
    ``,
    `— SDR Agent`,
  ].join("\n");

  await sendEmail({
    to: params.assignedRep.email,
    subject,
    body,
  });

  console.log(`[Notify] Email escalation notification sent to ${params.assignedRep.email}`);
}
