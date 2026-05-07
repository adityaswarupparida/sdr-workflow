import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "./system-prompt.js";
import { TOOLS } from "./tools/index.js";
import { dispatchTool } from "./dispatcher.js";
import { getOrCreateConversation, appendMessage, markResolved, setEscalated } from "../db/store.js";
import type { InboundEmail, AgentOutcome, EscalationReason, ConversationMessage } from "../types/index.js";

const anthropic = new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"] });

const MAX_TURNS = 10;

export async function runSdrAgent(inbound: InboundEmail): Promise<AgentOutcome> {
  const conversation = await getOrCreateConversation(inbound.threadId ?? `thread_${Date.now()}`, inbound.from);

  const userMessage: ConversationMessage = {
    role: "user",
    content: `From: ${inbound.from}\nSubject: ${inbound.subject}\n\n${inbound.body}`,
    timestamp: inbound.receivedAt,
  };
  await appendMessage(conversation.id, userMessage);

  // Build Anthropic message history from stored conversation
  const messages: Anthropic.MessageParam[] = conversation.messages.map((m) => {
    if (m.role === "user") return { role: "user", content: m.content };
    if (m.role === "assistant") return { role: "assistant", content: m.content };
    return { role: "user", content: m.content }; // fallback
  });

  // Add the new inbound message
  messages.push({ role: "user", content: userMessage.content });

  const outcome: AgentOutcome = {
    conversationId: conversation.id,
    escalated: false,
    emailSent: false,
    hubspotLogged: false,
  };

  let turn = 0;

  while (turn < MAX_TURNS) {
    turn++;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      // Cache the system prompt — it never changes across turns or conversations
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      messages,
    });

    const usage = response.usage as Anthropic.Usage & { cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
    if (usage.cache_read_input_tokens !== undefined || usage.cache_creation_input_tokens !== undefined) {
      console.log(`[Cache] turn ${turn} — write: ${usage.cache_creation_input_tokens ?? 0}, read: ${usage.cache_read_input_tokens ?? 0}, uncached: ${usage.input_tokens}`);
    }

    // Collect all content blocks from this response
    const assistantContent: Anthropic.ContentBlock[] = response.content;
    messages.push({ role: "assistant", content: assistantContent });

    if (response.stop_reason === "end_turn") {
      const textBlock = assistantContent.find((b) => b.type === "text");
      if (textBlock && textBlock.type === "text") {
        await appendMessage(conversation.id, {
          role: "assistant",
          content: textBlock.text,
          timestamp: new Date().toISOString(),
        });
      }
      await markResolved(conversation.id);
      break;
    }

    if (response.stop_reason === "tool_use") {
      const toolUseBlocks = assistantContent.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        console.log(`[Agent] Tool call: ${toolUse.name}`, toolUse.input);

        await appendMessage(conversation.id, {
          role: "tool_use",
          content: JSON.stringify(toolUse.input),
          toolName: toolUse.name,
          toolInput: toolUse.input,
          timestamp: new Date().toISOString(),
        });

        const dispatched = await dispatchTool(toolUse.name, toolUse.input as Record<string, unknown>);

        await appendMessage(conversation.id, {
          role: "tool_result",
          content: JSON.stringify(dispatched.result),
          toolName: toolUse.name,
          toolResult: dispatched.result,
          timestamp: new Date().toISOString(),
        });

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify(dispatched.result),
        });

        // Track outcomes from tool results
        if (toolUse.name === "send_email") outcome.emailSent = true;
        if (toolUse.name === "hubspot_log_activity") outcome.hubspotLogged = true;
        if (toolUse.name === "schedule_followup") {
          const inp = toolUse.input as { daysFromNow: number; reason: string };
          outcome.followupScheduled = { daysFromNow: inp.daysFromNow, reason: inp.reason };
        }

        // Escalation — stop the loop immediately
        if (dispatched.escalation) {
          const reason = dispatched.escalation.reason as EscalationReason;
          console.log(`[Agent] ESCALATING → ${reason} (urgency: ${dispatched.escalation.urgency})`);
          console.log(`[Agent] Draft reply for human review:\n${dispatched.escalation.draftReply ?? "(none)"}`);

          await setEscalated(conversation.id, reason, dispatched.escalation.draftReply);

          outcome.escalated = true;
          outcome.escalationReason = reason;
          outcome.draftReply = dispatched.escalation.draftReply;
          return outcome;
        }
      }

      messages.push({ role: "user", content: toolResults });
    }
  }

  return outcome;
}
