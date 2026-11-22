CREATE TABLE IF NOT EXISTS food_chat_preferences (
  user_id TEXT PRIMARY KEY NOT NULL,
  conversation_url TEXT CHECK (conversation_url IS NULL OR length(conversation_url) BETWEEN 20 AND 300)
);
