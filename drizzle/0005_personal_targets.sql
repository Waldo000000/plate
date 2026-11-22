CREATE TABLE personal_targets (
 user_id TEXT PRIMARY KEY NOT NULL,
 energy_budget_kj REAL CHECK (energy_budget_kj IS NULL OR energy_budget_kj BETWEEN 1 AND 50000),
 fibre_target_g REAL CHECK (fibre_target_g IS NULL OR fibre_target_g BETWEEN 1 AND 150),
 weight_goal_kg REAL CHECK (weight_goal_kg IS NULL OR weight_goal_kg BETWEEN 20 AND 800)
);
