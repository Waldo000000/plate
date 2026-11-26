CREATE TABLE IF NOT EXISTS estimate_daily (
  account_key TEXT NOT NULL,
  day TEXT NOT NULL,
  attempts INTEGER NOT NULL CHECK(attempts BETWEEN 1 AND 25),
  PRIMARY KEY (account_key, day)
) WITHOUT ROWID;
