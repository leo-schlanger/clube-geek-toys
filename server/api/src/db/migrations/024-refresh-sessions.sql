-- 024 — Uma sessão por dispositivo, em vez de uma sessão por pessoa
--
-- O refresh token morava em `users.refresh_token_hash`: UMA coluna por
-- usuário. Todo login sobrescrevia o valor, então entrar no celular invalidava
-- o token do computador — e o computador caía no logout no primeiro refresh
-- seguinte, no máximo 15 minutos depois. Era a reclamação "desloga muito
-- rápido": não era o prazo da sessão, era a sessão de um aparelho apagando a
-- do outro.
--
-- Cada sessão vira uma linha. `prev_token_hash` + `rotated_at` preservam a
-- janela de carência de 30s que evita corrida entre abas ao rotacionar; agora
-- ela é por sessão, e não mais global do usuário.
--
-- `expires_at` fica no banco de propósito: até aqui o único prazo real era o
-- `maxAge` do cookie, ou seja, o cliente decidia sozinho até quando a sessão
-- valia. Agora o servidor também sabe, e o cron limpa o que venceu.
--
-- O backfill migra as sessões vivas para que o deploy não deslogue ninguém, e
-- em seguida zera as colunas antigas: sem isso, uma segunda execução do
-- ensure-schema reinseriria um hash já revogado e ressuscitaria uma sessão
-- encerrada. A partir daqui as colunas em `users` ficam sem uso — não são
-- removidas porque migration que faz DROP não tem volta.

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
-- A carência de rotação é consultada com o token antigo; sem índice essa
-- leitura varreria a tabela inteira a cada corrida de abas.
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
