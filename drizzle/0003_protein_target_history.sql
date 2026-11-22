CREATE TABLE protein_target_history (
  user_id TEXT NOT NULL,
  effective_day TEXT NOT NULL,
  target_g REAL CHECK (target_g IS NULL OR target_g BETWEEN 1 AND 500),
  PRIMARY KEY (user_id, effective_day)
);
