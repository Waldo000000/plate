CREATE TABLE food_entries (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  day TEXT NOT NULL,
  description TEXT NOT NULL,
  kcal INTEGER NOT NULL CHECK (kcal BETWEEN 0 AND 20000),
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, id)
);
--> statement-breakpoint
CREATE INDEX food_entries_user_day ON food_entries(user_id, deleted, day, created_at);
--> statement-breakpoint
CREATE TABLE weights (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  kg REAL NOT NULL CHECK (kg BETWEEN 20 AND 800),
  PRIMARY KEY (user_id, day)
);
--> statement-breakpoint
CREATE TABLE completed_days (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  PRIMARY KEY (user_id, day)
);
