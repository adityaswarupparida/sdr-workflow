export const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS sales_reps (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    isActive INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    threadId TEXT UNIQUE NOT NULL,
    leadEmail TEXT NOT NULL,
    leadName TEXT,
    messages TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'active',
    escalationReason TEXT,
    draftReply TEXT,
    assignedRepId TEXT,
    summary TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    FOREIGN KEY (assignedRepId) REFERENCES sales_reps(id)
  );

  CREATE TABLE IF NOT EXISTS followups (
    id TEXT PRIMARY KEY,
    conversationId TEXT NOT NULL,
    scheduledAt TEXT NOT NULL,
    reason TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (conversationId) REFERENCES conversations(id)
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    passwordHash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'rep')),
    repId TEXT,
    createdAt TEXT NOT NULL,
    FOREIGN KEY (repId) REFERENCES sales_reps(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
`;
