CREATE TABLE nutrition_target_history (
  user_id TEXT NOT NULL,
  metric TEXT NOT NULL CHECK (metric IN ('energy_budget_kj', 'fibre_target_g')),
  effective_day TEXT NOT NULL,
  target_value REAL CHECK (target_value IS NULL OR
    (metric='energy_budget_kj' AND target_value BETWEEN 1 AND 50000) OR
    (metric='fibre_target_g' AND target_value BETWEEN 1 AND 150)),
  PRIMARY KEY (user_id, metric, effective_day)
);
