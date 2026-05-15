import type Anthropic from "@anthropic-ai/sdk";

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "salesforce_get_contact",
    description: "Look up a prospect by email in Salesforce. Returns their name, company, title, account ID, and current lead status.",
    input_schema: {
      type: "object" as const,
      properties: {
        email: { type: "string", description: "The prospect's email address" },
      },
      required: ["email"],
    },
  },
  {
    name: "salesforce_get_opportunities",
    description: "Get open opportunities for a Salesforce account. Use the accountId from salesforce_get_contact.",
    input_schema: {
      type: "object" as const,
      properties: {
        accountId: { type: "string", description: "The Salesforce account ID" },
      },
      required: ["accountId"],
    },
  },
  {
    name: "hubspot_upsert_contact",
    description: "Create or update a contact in HubSpot. Call this before logging any activity.",
    input_schema: {
      type: "object" as const,
      properties: {
        email: { type: "string" },
        name: { type: "string" },
        company: { type: "string" },
        title: { type: "string" },
      },
      required: ["email", "name", "company", "title"],
    },
  },
  {
    name: "hubspot_log_activity",
    description: "Log an email sent to a prospect in HubSpot.",
    input_schema: {
      type: "object" as const,
      properties: {
        contactId: { type: "string", description: "HubSpot contact ID" },
        subject: { type: "string" },
        body: { type: "string" },
      },
      required: ["contactId", "subject", "body"],
    },
  },
  {
    name: "hubspot_update_deal_stage",
    description: "Update a deal stage in HubSpot when the prospect's status changes.",
    input_schema: {
      type: "object" as const,
      properties: {
        contactId: { type: "string" },
        stage: {
          type: "string",
          enum: ["prospecting", "qualification", "proposal", "negotiation", "closed_won", "closed_lost"],
        },
      },
      required: ["contactId", "stage"],
    },
  },
  {
    name: "send_email",
    description: "Send an email reply to the prospect. Only call this for in-scope SDR topics.",
    input_schema: {
      type: "object" as const,
      properties: {
        to: { type: "string", description: "Recipient email address" },
        subject: { type: "string" },
        body: { type: "string", description: "Plain text email body" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "schedule_followup",
    description: "Schedule a follow-up email for this lead to be sent automatically in N days.",
    input_schema: {
      type: "object" as const,
      properties: {
        leadId: { type: "string" },
        conversationId: { type: "string", description: "The current conversation ID" },
        daysFromNow: { type: "number", description: "How many days from today to send the follow-up" },
        reason: { type: "string", description: "Why we're following up (used as context when the follow-up fires)" },
      },
      required: ["leadId", "daysFromNow", "reason"],
    },
  },
  {
    name: "escalate_to_human",
    description: "Escalate this conversation to a human rep when the topic is out of scope for the SDR. Always include a draftReply for the human to review.",
    input_schema: {
      type: "object" as const,
      properties: {
        reason: {
          type: "string",
          enum: ["pricing_or_quote", "technical_deep_dive", "existing_customer", "legal_or_contract", "low_confidence"],
        },
        draftReply: {
          type: "string",
          description: "A draft email reply for the human reviewer to approve, edit, or discard",
        },
        urgency: { type: "string", enum: ["low", "high"] },
      },
      required: ["reason", "urgency"],
    },
  },
  {
    name: "log_summary",
    description: "REQUIRED final step. Call this after all other tools are complete to log a structured summary of what was done in this conversation. Always call this last.",
    input_schema: {
      type: "object" as const,
      properties: {
        leadStatus: {
          type: "string",
          enum: ["new", "contacted", "qualified", "unqualified"],
          description: "Current qualification status of the lead",
        },
        actions: {
          type: "array",
          description: "Ordered list of actions taken, one entry per significant step",
          items: {
            type: "object",
            properties: {
              step: { type: "string", description: "Short action label e.g. 'Salesforce Lookup', 'Email Sent', 'Follow-up Scheduled'" },
              detail: { type: "string", description: "One-line detail e.g. 'Priya Nair · TechWave · 80 engineers'" },
            },
            required: ["step", "detail"],
          },
        },
        notes: {
          type: "string",
          description: "1-2 sentences of context for the rep reviewing this later — what matters, what to watch for",
        },
        nextAction: {
          type: "string",
          description: "What happens next: e.g. 'Awaiting reply', 'Follow-up May 19', 'Human review required'",
        },
      },
      required: ["leadStatus", "actions"],
    },
    // Cache breakpoint: tool list is fully cached across turns
    cache_control: { type: "ephemeral" as const },
  },
];
