-- 020 — Perfil de cliente sem assinatura + produtos salvos
--
-- Até aqui, dado pessoal só existia em `members`, que é o registro da
-- assinatura: exige CPF e nasce atrelado a um plano. Quem só quer comprar na
-- loja não tinha onde guardar telefone, nascimento, gênero ou endereço.
--
-- `customer_profiles` é 1:1 com `users` e independe de `members` — a pessoa
-- cria conta, preenche o que quiser e nunca assina nada. Quem depois vira
-- membro mantém o mesmo perfil; as duas tabelas convivem.
--
-- LGPD: todos os campos são opcionais e a coleta é declarada na política de
-- privacidade. `marketing_consent` guarda o aceite explícito para contato —
-- separado do cadastro, porque consentimento não pode vir embutido no serviço.

CREATE TABLE IF NOT EXISTS customer_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name VARCHAR(200),
  phone VARCHAR(20),
  birth_date DATE,
  -- Lista fechada com saída explícita: 'prefiro_nao_dizer' precisa ser uma
  -- opção de verdade, não a ausência do campo.
  gender VARCHAR(20) CHECK (gender IN (
    'feminino', 'masculino', 'nao_binario', 'outro', 'prefiro_nao_dizer'
  )),
  photo_url TEXT,
  -- Mesmo formato de `orders.shipping_address`, para o checkout pré-preencher.
  address JSONB,
  marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- "Compras salvas": produtos que a pessoa guarda para comprar depois.
-- O histórico de pedidos já vive em `orders` e não é duplicado aqui.
CREATE TABLE IF NOT EXISTS saved_products (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_products_user
  ON saved_products(user_id, created_at DESC);
