CREATE TABLE IF NOT EXISTS display_preferences (
  user_id TEXT PRIMARY KEY NOT NULL,
  energy_unit TEXT NOT NULL CHECK (energy_unit IN ('kj', 'kcal'))
);
