# RRTradeX: Trading & Investment Learning Platform

A full-stack implementation of the **RRTradeX SRS v1.0** (18 Nov 2026), built for Vercel.

- **Paper trading only.** Every user gets virtual INR funds. No real orders, money or broker connections.
- **Simulated market data** for 30 NSE-listed instruments. Every price is labelled *simulated* and shows its source, timestamp and freshness.
- Watchlists, price alerts, portfolio and P&L, a learning centre, a read-only AI assistant and a least-privilege admin console with audit logs.

```
Next.js 15 (React 19, App Router)  ──  /api/v1 route handlers (modular services)  ──  PostgreSQL
                                                                     └── optional Anthropic API (AI assistant)
```

---

## 1. Deploy to Vercel (about 10 minutes)

1. **Push this folder to a GitHub repository.**
2. **Import it in Vercel:** *Add New → Project →* select the repo. Vercel detects Next.js automatically.
3. **Add a Postgres database:** in the project, open *Storage → Create → Neon (Postgres)* and connect it to the project.
   This injects `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED`. Supabase, or any other Postgres, works too: set `DATABASE_URL` yourself.
   The app runs in `iad1` (Washington, D.C.) to sit next to a Neon `us-east-1` database. If your database is elsewhere, set `regions` in `vercel.json` to the nearest Vercel region, since every page makes several database round-trips.
4. **Set environment variables** (*Settings → Environment Variables*):

   | Variable | Required | Purpose |
   |---|---|---|
   | `DATABASE_URL` | ✅ | Pooled Postgres connection string (added by the Neon integration) |
   | `ADMIN_EMAIL`, `ADMIN_PASSWORD` | ✅ | First administrator, created by the seed (use a long password) |
   | `CRON_SECRET` | ✅ | Random string. Vercel Cron sends it as a bearer token |
   | `ANTHROPIC_API_KEY` | optional | Turns on the LLM assistant. Without it, a built-in rule-based tutor answers |
   | `AI_MODEL` | optional | Defaults to `claude-sonnet-5-5` |
   | `SEED_DEMO_USERS` | optional | `true` creates `demo@`, `trader@` and `content@rrtradex.app` (for academic demos only) |
   | `DEMO_PASSWORD` | optional | Password for those demo users (default `Demo@12345`) |

5. **Deploy.** `npm run build` applies the SQL migrations, seeds an empty database (instruments, lessons, config, admin) and builds the app.
6. Sign in at `/login` with your admin account. Retail users self-register at `/register`. Admins can promote users to **Trader** from *Admin → Users*.

The daily cron (`vercel.json`, 03:00 IST) expires stale limit orders, refreshes quotes, takes portfolio snapshots and prunes old quotes. It runs on the Hobby plan. Quotes and order matching also refresh on every page view, so the app doesn't depend on the cron.

## 2. Run locally

```bash
npm install
cp .env.example .env.local          # set DATABASE_URL (local Postgres works), ADMIN_EMAIL/PASSWORD
export $(grep -v '^#' .env.local | xargs)
npm run db:migrate                  # schema + seed
npm run dev                         # http://localhost:3000
```

Tests:

```bash
npm test                            # unit tests: fees, slippage, cost basis, P&L, simulator
npm run build && npm start &        # then, with DATABASE_URL + ADMIN_* exported:
npm run test:e2e                    # 42 acceptance checks against the running app (SRS §13.2)
```

CI (`.github/workflows/ci.yml`) runs the dependency audit, typecheck, unit tests, build and the full end-to-end suite against a Postgres service.

---

## 3. How the SRS maps to the code

| SRS area | Where |
|---|---|
| Schema / ERD (§6, App. A), incl. §6.6 extension tables | `db/migrations/001_init.sql`: all 16 ERD tables plus `order_events`, `portfolio_snapshots`, `notifications`, `audit_logs`, `platform_config`, `auth_sessions`, `learning_categories`. NUMERIC money columns, CHECK constraints, the unique keys from §6.4, FK indexes |
| Append-only ledger and audit (BR-15, FR-ADM-03) | DB triggers reject UPDATE/DELETE on `wallet_transactions`, `audit_logs`, `order_events` |
| Auth & RBAC (FR-ACC, §9.1) | `src/lib/auth.ts`, `src/lib/api.ts`: bcrypt (cost 12), opaque 12-hour session tokens stored hashed, httpOnly cookie, revoke on logout / sign-out-everywhere / role change, server-side role and permission checks on every route, object-level `user_id` scoping, origin check on mutations, rate limits, a DB-backed login lockout |
| Market data (FR-MKT) | `src/lib/market/simulator.ts` (deterministic price model), `service.ts` (provider adapter, ingestion, stale/unavailable handling) |
| Trading (FR-TRD, BR-10…14) | `src/lib/trading/engine.ts`: validation, idempotency keys, order state machine, a single-transaction fill (trade + ledger + wallet + holding + order + events), row locks, limit-order matching, cancel and expiry |
| Portfolio (FR-POR) | `src/lib/portfolio.ts`: valuation, realised and unrealised P&L, freshness disclosures, snapshots |
| Watchlists & alerts (FR-WAT) | `src/app/api/v1/watchlists`, `alerts`, `src/lib/alerts.ts` |
| Learning (FR-LRN) | `src/app/api/v1/learning`, admin content routes, the seed lessons in `scripts/seed.mjs` |
| AI assistant (FR-AI, §8) | `src/lib/ai/assistant.ts`: four typed read-only tools tied to the session user, no write tools, a prompt-injection guard, tool-call logging, a rule-based fallback, a disclaimer on every reply |
| Admin (FR-ADM, §9.4) | `src/app/api/v1/admin/*` with granular permissions (`users:manage`, `content:manage`, `audit:read`, `config:manage`, `reports:read`, `finance:adjust`). Admins can never trade. Wallet adjustments need `finance:adjust`, a written reason, and post a compensating ledger entry plus an audit record |
| API (§7.2, App. B) | Versioned `/api/v1/*`, uniform `{error:{code,message,details,requestId}}` responses, no stack traces. OpenAPI spec at `/api/v1/openapi` |
| UI (§7.1) | Every core screen in `src/app/(app)/*`, with a permanent paper-trading banner, quote source/time/status chips and order confirmation modals |
| Observability (§10) | Structured JSON logs with a request correlation ID (`x-request-id`) on every API call, `/api/v1/health` |

### Architecture note (SRS §4.4)
The SRS lists Django REST and React as the baseline and explicitly allows a modular backend for the MVP. This build keeps the logical service boundaries (User, Market Data, Trading, Portfolio, Alert, Learning, AI, Admin) as separate modules with their own data ownership, but deploys them as one Next.js application. That is the form Vercel runs natively. Any module can later be extracted into its own service behind the same `/api/v1` contract.

### Decisions taken for SRS §15.2 (all configurable in *Admin → Configuration*)

| Open decision | Choice in this build |
|---|---|
| Instrument universe / data provider | 30 large-cap NSE symbols, deterministic **simulator** (no licensed feed, so nothing implies real-time NSE/BSE data) |
| Starting balance / currency | ₹10,00,000 virtual INR, one wallet per user |
| Execution model | Market orders fill instantly at the latest quote ± 5 bps slippage, snapped to ₹0.05 ticks. Limit orders rest until the simulated price crosses, then fill in full at the limit or better. Limit prices must be within ±20% of the last price. Validity is 7 days |
| Fees / tax | Brokerage = min(₹20, 0.03% of turnover) + simulated statutory charges of 0.05% of turnover, per execution. Taxes are not modelled |
| Cost basis | Weighted-average cost with buy fees capitalised. Realised P&L = sell proceeds after fees − quantity × average cost |
| Rounding | Money to 2 dp, average price to 4 dp, ROUND_HALF_UP (decimal.js, never floats) |
| Mobile | Responsive web (React Native client deferred) |
| ORDER_EVENTS / AUDIT_LOGS / PORTFOLIO_SNAPSHOTS | Included in the first migration |

### Role-aware features
- **Retail (learner):** paper trading, a basic chart, 5 watchlists, 20 active alerts.
- **Trader:** SMA 20 / EMA 50 overlays and volume on charts, trade analytics (win rate, turnover, fees, best/worst), 20 watchlists, 100 alerts.
- **Admin:** only the console sections their permissions allow. No wallet and no trading.

## 4. Known limitations
- Market data is simulated, and all instruments trade around the clock. A licensed provider plugs into the `MarketDataProvider` interface in `src/lib/market/service.ts`.
- The simulator fills orders in full. The schema and engine support multiple trades per order (partial fills), but the simulator doesn't produce them.
- The general API rate limiter is in-memory per serverless instance. Login brute-force protection is durable (database-backed). For strict global limits, swap `src/lib/ratelimit.ts` for Upstash/Redis.
- Notifications are in-app only. Email and push are modelled in the `notifications.channel` column but not sent.
- Before any real-money, brokerage or advice functionality, the legal and compliance review in SRS §9.3 is required. This software must not be presented as a SEBI-registered service.
