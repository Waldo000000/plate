ALTER TABLE estimate_daily RENAME TO estimate_daily_small;
--> statement-breakpoint
CREATE TABLE estimate_daily (
  account_key TEXT NOT NULL,
  day TEXT NOT NULL,
  attempts INTEGER NOT NULL CHECK(attempts BETWEEN 1 AND 60),
  PRIMARY KEY (account_key, day)
) WITHOUT ROWID;
--> statement-breakpoint
INSERT INTO estimate_daily SELECT account_key, day, attempts FROM estimate_daily_small;
--> statement-breakpoint
DROP TABLE estimate_daily_small;
