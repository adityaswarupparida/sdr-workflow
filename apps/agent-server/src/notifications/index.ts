import { sendSlackEscalationNotification } from "./slack.js";
import { sendEmailEscalationNotification } from "./email.js";
import type { EscalationReason, SalesRep } from "../types/index.js";

export interface EscalationNotificationParams {
  conversationId: string;
  leadEmail: string;
  reason: EscalationReason;
  urgency: "low" | "high";
  assignedRep?: SalesRep;
  draftReply?: string;
}

export async function notifyEscalation(params: EscalationNotificationParams): Promise<void> {
  const tasks: Promise<void>[] = [
    sendSlackEscalationNotification(params),
  ];

  // Only send email notification if there's an assigned rep
  if (params.assignedRep) {
    tasks.push(
      sendEmailEscalationNotification({
        ...params,
        assignedRep: params.assignedRep,
      }),
    );
  }

  // Fire both — don't let one failure block the other
  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("[Notify] Notification channel failed:", result.reason);
    }
  }
}
