import * as salesforce from "../integrations/salesforce/client.js";
import * as hubspot from "../integrations/hubspot/client.js";
import * as email from "../integrations/email/client.js";
import type { Lead } from "../types/index.js";

interface DispatchResult {
  result: unknown;
  escalation?: {
    reason: string;
    draftReply?: string;
    urgency: string;
  };
}

export async function dispatchTool(name: string, input: Record<string, unknown>): Promise<DispatchResult> {
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
      const result = await email.sendEmail({
        to: input["to"] as string,
        subject: input["subject"] as string,
        body: input["body"] as string,
      });
      return { result };
    }

    case "schedule_followup": {
      console.log(`[Followup] Scheduled for lead ${input["leadId"]} in ${input["daysFromNow"]} days: ${input["reason"]}`);
      return { result: { scheduled: true, daysFromNow: input["daysFromNow"] } };
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
