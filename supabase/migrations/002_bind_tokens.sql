-- telegram_bind_tokens (臨時綁定碼，15 分鐘 TTL)
CREATE TABLE telegram_bind_tokens (
  token TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE telegram_bind_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own bind tokens" ON telegram_bind_tokens
  FOR ALL USING (auth.uid() = user_id);
