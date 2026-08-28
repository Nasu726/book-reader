-- Daily write budget, per reader.
--
-- Mirrors src/server/db/migrate-function.ts. See src/server/usage/write-budget.ts
-- for why the count exists at all.

CREATE TABLE IF NOT EXISTS usage_counters (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  writes INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
);
