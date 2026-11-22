CREATE TABLE user_settings (
  user_id TEXT PRIMARY KEY NOT NULL,
  protein_target_g REAL CHECK (protein_target_g IS NULL OR protein_target_g BETWEEN 1 AND 500)
);
