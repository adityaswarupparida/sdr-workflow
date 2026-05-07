export const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    threadId TEXT UNIQUE NOT NULL,
    leadEmail TEXT NOT NULL,
    leadName TEXT,
    messages TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'active',
    escalationReason TEXT,
    draftReply TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS followups (
    id TEXT PRIMARY KEY,
    conversationId TEXT NOT NULL,
    scheduledAt TEXT NOT NULL,
    reason TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (conversationId) REFERENCES conversations(id)
  );
`;
