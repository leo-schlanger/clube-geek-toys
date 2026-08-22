-- 024 — One session per device instead of one per person
--
-- The refresh token lived in a single `users.refresh_token_hash` column, so
-- logging in on the phone logged out the desktop. Each session is now a row.
-- `prev_token_hash` + `rotated_at` keep the 30s grace window against tab races,
-- now per session.
--
-- `expires_at` lives in the database so the server, not only the cookie
-- `maxAge`, decides how long a session is valid; the cron clears what expired.
--
-- The backfill migrates live sessions so the deploy logs nobody out, then
-- clears the old columns — otherwise a second ensure-schema run would revive a
-- revoked session. The `users` columns stay unused: a DROP has no way back.

CREATE TABLE IF NOT EXISTS refresh_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  prev_token_hash TEXT,
  rotated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_refresh_sessions_user ON refresh_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_sessions_expires ON refresh_sessions(expires_at);
-- The rotation grace window is looked up by the previous token.
CREATE INDEX IF NOT EXISTS idx_refresh_sessions_prev
  ON refresh_sessions(prev_token_hash)
  WHERE prev_token_hash IS NOT NULL;

INSERT INTO refresh_sessions (user_id, token_hash, expires_at)
SELECT id, refresh_token_hash, NOW() + INTERVAL '30 days'
  FROM users
 WHERE refresh_token_hash IS NOT NULL
ON CONFLICT (token_hash) DO NOTHING;

UPDATE users
   SET refresh_token_hash = NULL, prev_refresh_token_hash = NULL
 WHERE refresh_token_hash IS NOT NULL OR prev_refresh_token_hash IS NOT NULL;
