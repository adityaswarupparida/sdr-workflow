export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  cc?: string[];
  replyToMessageId?: string;
}

export interface SendEmailResult {
  messageId: string;
  sentAt: string;
}

// Our internal curl/test format
export interface InboundEmailWebhook {
  from: string;
  subject: string;
  body: string;
  threadId?: string;
  messageId?: string;
}

// Postmark inbound webhook payload
export interface PostmarkInboundPayload {
  From: string;
  FromName?: string;
  Subject: string;
  TextBody: string;
  HtmlBody?: string;
  MessageID: string;
  Date: string;
  Headers: Array<{ Name: string; Value: string }>;
  ReplyTo?: string;
}
