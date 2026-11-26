ALTER TABLE plate_accounts ADD COLUMN email TEXT;
--> statement-breakpoint
ALTER TABLE estimate_daily RENAME TO estimate_daily_prior;
--> statement-breakpoint
CREATE TABLE estimate_daily (
  account_key TEXT NOT NULL,
  day TEXT NOT NULL,
  attempts INTEGER NOT NULL CHECK(attempts BETWEEN 1 AND 300),
  starter_attempts INTEGER NOT NULL DEFAULT 0 CHECK(starter_attempts BETWEEN 0 AND 300),
  PRIMARY KEY (account_key, day)
) WITHOUT ROWID;
--> statement-breakpoint
INSERT INTO estimate_daily SELECT account_key,day,attempts,starter_attempts FROM estimate_daily_prior;
--> statement-breakpoint
DROP TABLE estimate_daily_prior;
--> statement-breakpoint
CREATE INDEX estimate_daily_starter_total ON estimate_daily(day,starter_attempts) WHERE starter_attempts>0;
--> statement-breakpoint
CREATE TABLE plate_quota_policy (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  standard_daily INTEGER NOT NULL CHECK(standard_daily BETWEEN 1 AND 300),
  shared_daily INTEGER NOT NULL CHECK(shared_daily BETWEEN 1 AND 300),
  trusted_daily INTEGER NOT NULL CHECK(trusted_daily BETWEEN 1 AND 300),
  CHECK(standard_daily<=shared_daily AND standard_daily<=trusted_daily)
);
--> statement-breakpoint
INSERT INTO plate_quota_policy VALUES (1,10,30,60);
