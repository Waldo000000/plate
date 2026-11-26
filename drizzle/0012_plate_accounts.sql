CREATE TABLE plate_accounts (
  account_id TEXT PRIMARY KEY NOT NULL,
  public_id TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'standard' CHECK(role IN ('standard','trusted','blocked')),
  joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
--> statement-breakpoint
CREATE INDEX plate_accounts_listing ON plate_accounts(joined_at DESC, public_id DESC);
--> statement-breakpoint
ALTER TABLE estimate_daily ADD COLUMN starter_attempts INTEGER NOT NULL DEFAULT 0 CHECK(starter_attempts BETWEEN 0 AND 60);
--> statement-breakpoint
CREATE INDEX estimate_daily_starter_total ON estimate_daily(day, starter_attempts) WHERE starter_attempts > 0;
