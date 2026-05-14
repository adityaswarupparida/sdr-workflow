import type { EscalationReason, SalesRep } from "../types/index.js";

const REASON_LABELS: Record<EscalationReason, string> = {
  pricing_or_quote: "Pricing / Quote",
  technical_deep_dive: "Technical Deep Dive",
  existing_customer: "Existing Customer",
  legal_or_contract: "Legal / Contract",
  low_confidence: "Low Confidence",
};

const ROUTE_LABELS: Record<EscalationReason, string> = {
  pricing_or_quote: "→ AE",
  technical_deep_dive: "→ SE",
  existing_customer: "→ CS",
  legal_or_contract: "→ Legal",
  low_confidence: "→ Rep",
};

type SlackTextField = { type: "mrkdwn"; text: string };
type SlackBlock =
  | { type: "header"; text: { type: "plain_text"; text: string } }
  | { type: "section"; fields: SlackTextField[] }
  | { type: "section"; text: SlackTextField };

interface SlackNotificationParams {
  conversationId: string;
  leadEmail: string;
  reason: EscalationReason;
  urgency: "low" | "high";
  assignedRep?: SalesRep;
  draftReply?: string;
}

export async function sendSlackEscalationNotification(params: SlackNotificationParams): Promise<void> {
  const webhookUrl = process.env["SLACK_WEBHOOK_URL"];
  if (!webhookUrl) {
    console.log(`[Slack] No SLACK_WEBHOOK_URL set — skipping Slack notification`);
    return;
  }

  const dashboardUrl = process.env["DASHBOARD_URL"] ?? "http://localhost:3000";
  const convUrl = `${dashboardUrl}/conversations/${params.conversationId}`;
  const urgencyEmoji = params.urgency === "high" ? "🔴" : "🟡";
  const reasonLabel = REASON_LABELS[params.reason];
  const routeLabel = ROUTE_LABELS[params.reason];

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: `${urgencyEmoji} SDR Escalation: ${reasonLabel} ${routeLabel}` },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Lead*\n${params.leadEmail}` },
        { type: "mrkdwn", text: `*Assigned Rep*\n${params.assignedRep ? params.assignedRep.name : "Unassigned"}` },
        { type: "mrkdwn", text: `*Reason*\n${reasonLabel}` },
        { type: "mrkdwn", text: `*Urgency*\n${params.urgency === "high" ? "High" : "Normal"}` },
      ],
    },
  ];

  if (params.draftReply) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Draft reply (agent):*\n>${params.draftReply.split("\n").join("\n>")}` },
    });
  }

  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: `<${convUrl}|Review conversation in dashboard →>` },
  });

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blocks }),
  });

  if (!res.ok) {
    console.error(`[Slack] Notification failed: ${res.status} ${await res.text()}`);
  } else {
    console.log(`[Slack] Escalation notification sent for conversation ${params.conversationId}`);
  }
}
