import * as salesforce from "../integrations/salesforce/client.js";
import * as hubspot from "../integrations/hubspot/client.js";
import * as email from "../integrations/email/client.js";
import { scheduleFollowup } from "../queue/followup.queue.js";
import { getConversation } from "../db/store.js";
import type { Lead } from "../types/index.js";

interface DispatchResult {
  result: unknown;
  escalation?: {
    reason: string;
    draftReply?: string;
    urgency: string;
  };
}

export async function dispatchTool(
  name: string,
  input: Record<string, unknown>,
  repEmail?: string,
  conversationId?: string,
): Promise<DispatchResult> {
  switch (name) {
    case "salesforce_get_contact": {
      const contact = await salesforce.getContact(input["email"] as string);
      return { result: contact ?? { error: "Contact not found in Salesforce" } };
    }

    case "salesforce_get_opportunities": {
      const opps = await salesforce.getOpportunities(input["accountId"] as string);
      return { result: opps };
    }

    case "hubspot_upsert_contact": {
      const lead: Lead = {
        id: "",
        name: input["name"] as string,
        email: input["email"] as string,
        company: input["company"] as string,
        title: input["title"] as string,
        accountId: "",
        status: "new",
      };
      const contact = await hubspot.upsertContact(lead);
      return { result: { contactId: contact.id, success: true } };
    }

    case "hubspot_log_activity": {
      const activity = await hubspot.logEmailActivity(
        input["contactId"] as string,
        input["subject"] as string,
        input["body"] as string,
      );
      return { result: { activityId: activity.id, success: true } };
    }

    case "hubspot_update_deal_stage": {
      await hubspot.updateDealStage(input["contactId"] as string, input["stage"] as string);
      return { result: { success: true } };
    }

    case "send_email": {
      // Always CC the assigned rep so they can track the conversation
      const cc = repEmail ? [repEmail] : undefined;
      const result = await email.sendEmail({
        to: input["to"] as string,
        subject: input["subject"] as string,
        body: input["body"] as string,
        cc,
      });
      return { result };
    }

    case "schedule_followup": {
      const leadId = input["leadId"] as string;
      const daysFromNow = input["daysFromNow"] as number;
      const reason = input["reason"] as string;

      // Use conversationId passed from the agent loop — reliable, agent doesn't need to track it
      const conv = conversationId ? getConversation(conversationId) : null;
      const leadEmail = conv?.leadEmail ?? (input["leadEmail"] as string | undefined) ?? "unknown@lead.com";
      const resolvedConvId = conversationId ?? "unknown";

      const scheduledFor = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString();

      const jobId = await scheduleFollowup(
        { conversationId: resolvedConvId, leadEmail, leadId, reason, scheduledFor },
        daysFromNow,
      );

      return { result: { scheduled: true, daysFromNow, jobId, scheduledFor } };
    }

    case "escalate_to_human": {
      return {
        result: { escalated: true, message: "Conversation flagged for human review" },
        escalation: {
          reason: input["reason"] as string,
          draftReply: input["draftReply"] as string | undefined,
          urgency: input["urgency"] as string,
        },
      };
    }

    default:
      return { result: { error: `Unknown tool: ${name}` } };
  }
}
