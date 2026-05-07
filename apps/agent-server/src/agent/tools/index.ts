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
    description: "Schedule a follow-up task for this lead.",
    input_schema: {
      type: "object" as const,
      properties: {
        leadId: { type: "string" },
        daysFromNow: { type: "number", description: "How many days from today to follow up" },
        reason: { type: "string", description: "Why we're following up" },
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
    // Cache breakpoint: everything up to and including the tool list is cached across turns
    cache_control: { type: "ephemeral" as const },
  },
];
