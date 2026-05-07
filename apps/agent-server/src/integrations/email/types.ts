export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  replyToMessageId?: string;
}

export interface SendEmailResult {
  messageId: string;
  sentAt: string;
}

export interface InboundEmailWebhook {
  from: string;
  subject: string;
  body: string;
  threadId?: string;
  messageId?: string;
}
