-- RRTradeX baseline schema (SRS v1.0 §6, Appendix A)
-- All money, price and quantity columns use NUMERIC (never float).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ───────────────────────── Users & identity ─────────────────────────
CREATE TABLE users (
  user_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email            TEXT NOT NULL,
  password_hash    TEXT NOT NULL,
  role             TEXT NOT NULL DEFAULT 'retail' CHECK (role IN ('retail','trader','admin')),
  admin_permissions TEXT[] NOT NULL DEFAULT '{}',
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
  kyc_status       TEXT NOT NULL DEFAULT 'not_collected'
                   CHECK (kyc_status IN ('not_collected','self_declared','pending_provider','provider_verified')),
  last_login_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_email_lower CHECK (email = lower(email))
);
CREATE UNIQUE INDEX users_email_uq ON users (email);
CREATE INDEX users_role_status_idx ON users (role, status);

CREATE TABLE user_profiles (
  profile_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
  full_name        TEXT NOT NULL,
  phone            TEXT,
  risk_profile     TEXT NOT NULL DEFAULT 'moderate' CHECK (risk_profile IN ('conservative','moderate','aggressive')),
  experience_level TEXT NOT NULL DEFAULT 'beginner' CHECK (experience_level IN ('beginner','intermediate','advanced')),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE auth_sessions (
  session_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  user_agent   TEXT,
  ip           TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ
);
CREATE INDEX auth_sessions_user_idx ON auth_sessions (user_id);

-- ───────────────────────── Market data ─────────────────────────
CREATE TABLE instruments (
  instrument_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol         TEXT NOT NULL,
  company_name   TEXT NOT NULL,
  exchange       TEXT NOT NULL,
  sector         TEXT NOT NULL,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  -- simulator parameters (only used by the simulated market-data provider)
  sim_base_price NUMERIC(18,2) NOT NULL CHECK (sim_base_price > 0),
  sim_volatility NUMERIC(6,4) NOT NULL DEFAULT 0.0200 CHECK (sim_volatility > 0 AND sim_volatility < 1),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (symbol, exchange)
);

CREATE TABLE market_quotes (
  quote_id      BIGSERIAL PRIMARY KEY,
  instrument_id UUID NOT NULL REFERENCES instruments(instrument_id) ON DELETE CASCADE,
  last_price    NUMERIC(18,2) NOT NULL CHECK (last_price > 0),
  prev_close    NUMERIC(18,2) CHECK (prev_close > 0),
  change_pct    NUMERIC(9,4),
  volume        BIGINT CHECK (volume >= 0),
  quoted_at     TIMESTAMPTZ NOT NULL,
  observed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  source        TEXT NOT NULL,
  feed_status   TEXT NOT NULL CHECK (feed_status IN ('live','delayed','stale','simulated','unavailable'))
);
CREATE INDEX market_quotes_instr_time_idx ON market_quotes (instrument_id, quoted_at DESC);

-- ───────────────────────── Wallet & ledger ─────────────────────────
CREATE TABLE wallets (
  wallet_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  currency          TEXT NOT NULL DEFAULT 'INR' CHECK (char_length(currency) = 3),
  wallet_type       TEXT NOT NULL DEFAULT 'virtual' CHECK (wallet_type = 'virtual'),
  available_balance NUMERIC(20,2) NOT NULL CHECK (available_balance >= 0),
  starting_balance  NUMERIC(20,2) NOT NULL CHECK (starting_balance >= 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, currency)
);

CREATE TABLE wallet_transactions (
  wallet_txn_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id      UUID NOT NULL REFERENCES wallets(wallet_id) ON DELETE CASCADE,
  txn_type       TEXT NOT NULL CHECK (txn_type IN ('initial_credit','trade_buy','trade_sell','adjustment_credit','adjustment_debit')),
  direction      TEXT NOT NULL CHECK (direction IN ('credit','debit')),
  amount         NUMERIC(20,2) NOT NULL CHECK (amount > 0),
  balance_after  NUMERIC(20,2) NOT NULL CHECK (balance_after >= 0),
  reference_type TEXT,
  reference_id   TEXT,
  note           TEXT,
  created_by     UUID REFERENCES users(user_id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX wallet_txn_wallet_idx ON wallet_transactions (wallet_id, created_at DESC);

-- ───────────────────────── Orders, events, trades ─────────────────────────
CREATE TABLE orders (
  order_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  instrument_id   UUID NOT NULL REFERENCES instruments(instrument_id),
  side            TEXT NOT NULL CHECK (side IN ('buy','sell')),
  order_type      TEXT NOT NULL CHECK (order_type IN ('market','limit')),
  quantity        NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
  limit_price     NUMERIC(18,2) CHECK (limit_price > 0),
  filled_qty      NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (filled_qty >= 0),
  status          TEXT NOT NULL CHECK (status IN ('pending','open','partially_filled','filled','cancelled','rejected','expired')),
  reject_reason   TEXT,
  idempotency_key TEXT NOT NULL,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT orders_limit_price_rule CHECK ((order_type = 'limit') = (limit_price IS NOT NULL)),
  CONSTRAINT orders_fill_le_qty CHECK (filled_qty <= quantity),
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX orders_user_created_idx ON orders (user_id, created_at DESC);
CREATE INDEX orders_status_instr_idx ON orders (status, instrument_id);

CREATE TABLE order_events (
  event_id   BIGSERIAL PRIMARY KEY,
  order_id   UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('submitted','accepted','rejected','partial_fill','filled','cancel_requested','cancelled','expired')),
  detail     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX order_events_order_idx ON order_events (order_id, event_id);

CREATE TABLE trades (
  trade_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  instrument_id   UUID NOT NULL REFERENCES instruments(instrument_id),
  side            TEXT NOT NULL CHECK (side IN ('buy','sell')),
  execution_price NUMERIC(18,2) NOT NULL CHECK (execution_price > 0),
  executed_qty    NUMERIC(18,4) NOT NULL CHECK (executed_qty > 0),
  gross_amount    NUMERIC(20,2) NOT NULL CHECK (gross_amount > 0),
  fees            NUMERIC(20,2) NOT NULL CHECK (fees >= 0),
  net_amount      NUMERIC(20,2) NOT NULL,
  realized_pnl    NUMERIC(20,2),
  executed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX trades_user_time_idx ON trades (user_id, executed_at DESC);
CREATE INDEX trades_order_idx ON trades (order_id);

-- ───────────────────────── Holdings & portfolio ─────────────────────────
CREATE TABLE holdings (
  holding_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  instrument_id UUID NOT NULL REFERENCES instruments(instrument_id),
  quantity      NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  avg_buy_price NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (avg_buy_price >= 0),
  realized_pnl  NUMERIC(20,2) NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, instrument_id)
);

CREATE TABLE portfolio_snapshots (
  snapshot_id    BIGSERIAL PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  cash_balance   NUMERIC(20,2) NOT NULL,
  holdings_value NUMERIC(20,2) NOT NULL,
  total_value    NUMERIC(20,2) NOT NULL,
  invested_cost  NUMERIC(20,2) NOT NULL,
  unrealized_pnl NUMERIC(20,2) NOT NULL,
  realized_pnl   NUMERIC(20,2) NOT NULL,
  captured_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX portfolio_snapshots_user_idx ON portfolio_snapshots (user_id, captured_at DESC);

-- ───────────────────────── Watchlists & alerts ─────────────────────────
CREATE TABLE watchlists (
  watchlist_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  name         TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE watchlist_items (
  item_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id  UUID NOT NULL REFERENCES watchlists(watchlist_id) ON DELETE CASCADE,
  instrument_id UUID NOT NULL REFERENCES instruments(instrument_id),
  added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (watchlist_id, instrument_id)
);
CREATE INDEX watchlist_items_instr_idx ON watchlist_items (instrument_id);

CREATE TABLE price_alerts (
  alert_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  instrument_id   UUID NOT NULL REFERENCES instruments(instrument_id),
  condition       TEXT NOT NULL CHECK (condition IN ('above','below')),
  target_price    NUMERIC(18,2) NOT NULL CHECK (target_price > 0),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  triggered_at    TIMESTAMPTZ,
  triggered_price NUMERIC(18,2),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX price_alerts_active_idx ON price_alerts (instrument_id) WHERE is_active;
CREATE INDEX price_alerts_user_idx ON price_alerts (user_id);

CREATE TABLE notifications (
  notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('price_alert','order','system')),
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  channel         TEXT NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app','email','push')),
  delivery_status TEXT NOT NULL DEFAULT 'delivered' CHECK (delivery_status IN ('queued','delivered','failed')),
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);

-- ───────────────────────── Learning ─────────────────────────
CREATE TABLE learning_categories (
  category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  sort_order  INT NOT NULL DEFAULT 0
);

CREATE TABLE learning_contents (
  content_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  body         TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL CHECK (content_type IN ('article','video','tutorial')),
  url          TEXT,
  category_id  UUID REFERENCES learning_categories(category_id) ON DELETE SET NULL,
  difficulty   TEXT NOT NULL DEFAULT 'beginner' CHECK (difficulty IN ('beginner','intermediate','advanced')),
  duration_min INT NOT NULL DEFAULT 5 CHECK (duration_min > 0),
  published_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','unpublished','archived')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX learning_contents_status_idx ON learning_contents (status, category_id);

CREATE TABLE learning_progress (
  progress_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  content_id   UUID NOT NULL REFERENCES learning_contents(content_id) ON DELETE CASCADE,
  progress_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  completed_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, content_id)
);

-- ───────────────────────── AI assistant ─────────────────────────
CREATE TABLE ai_sessions (
  session_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  title        TEXT NOT NULL DEFAULT 'New conversation',
  context_type TEXT NOT NULL DEFAULT 'general' CHECK (context_type IN ('general','learning','portfolio','market')),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_sessions_user_idx ON ai_sessions (user_id, started_at DESC);

CREATE TABLE ai_messages (
  message_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL REFERENCES ai_sessions(session_id) ON DELETE CASCADE,
  sender       TEXT NOT NULL CHECK (sender IN ('user','assistant')),
  message_text TEXT NOT NULL,
  provider     TEXT,
  model        TEXT,
  tool_calls   JSONB,
  tokens_in    INT,
  tokens_out   INT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_messages_session_idx ON ai_messages (session_id, created_at);

-- ───────────────────────── Admin, config, audit ─────────────────────────
CREATE TABLE platform_config (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_by UUID REFERENCES users(user_id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  audit_id      BIGSERIAL PRIMARY KEY,
  actor_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  target_type   TEXT,
  target_id     TEXT,
  reason        TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip            TEXT,
  request_id    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_time_idx ON audit_logs (created_at DESC);
CREATE INDEX audit_logs_action_idx ON audit_logs (action, created_at DESC);

-- ───────────────────────── Append-only guards (BR-15, FR-ADM-03) ─────────────────────────
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; use compensating entries', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER wallet_transactions_append_only
  BEFORE UPDATE OR DELETE ON wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER order_events_append_only
  BEFORE UPDATE OR DELETE ON order_events
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
