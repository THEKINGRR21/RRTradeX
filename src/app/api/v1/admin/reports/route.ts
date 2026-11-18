import { api } from "@/lib/api";
import { one, q } from "@/lib/db";

export const GET = api({ permission: "reports:read" }, async () => {
  const [users, orders, trades, alerts, learning, ai, feed, recon, daily] = await Promise.all([
    q(`SELECT role, status, count(*)::int AS n FROM users GROUP BY 1,2 ORDER BY 1,2`),
    q(`SELECT status, count(*)::int AS n FROM orders WHERE created_at > now() - interval '7 days' GROUP BY 1 ORDER BY 2 DESC`),
    one(`SELECT count(*)::int AS n, COALESCE(SUM(gross_amount),0) AS turnover, COALESCE(SUM(fees),0) AS fees FROM trades WHERE executed_at > now() - interval '7 days'`),
    one(`SELECT count(*) FILTER (WHERE is_active)::int AS active, count(*) FILTER (WHERE triggered_at > now() - interval '7 days')::int AS triggered_7d FROM price_alerts`),
    one(`SELECT count(*)::int AS progress_rows, count(*) FILTER (WHERE completed_at IS NOT NULL)::int AS completions FROM learning_progress`),
    one(`SELECT count(*)::int AS messages, count(DISTINCT session_id)::int AS sessions FROM ai_messages WHERE created_at > now() - interval '7 days'`),
    one(`SELECT max(observed_at) AS last_quote, count(*)::int AS quotes_24h FROM market_quotes WHERE observed_at > now() - interval '24 hours'`),
    q(`SELECT w.wallet_id, u.email, w.available_balance, l.bal AS ledger_balance FROM wallets w JOIN users u USING (user_id)
         JOIN LATERAL (SELECT COALESCE(SUM(CASE WHEN direction='credit' THEN amount ELSE -amount END),0) AS bal FROM wallet_transactions t WHERE t.wallet_id=w.wallet_id) l ON true
        WHERE l.bal <> w.available_balance`),
    q(`SELECT date_trunc('day', executed_at AT TIME ZONE 'Asia/Kolkata')::date AS day, count(*)::int AS trades, SUM(gross_amount) AS turnover
         FROM trades WHERE executed_at > now() - interval '30 days' GROUP BY 1 ORDER BY 1`),
  ]);
  return {
    users, ordersLast7d: orders, tradesLast7d: trades, alerts, learning, aiLast7d: ai, dailyTrades: daily,
    marketFeed: { ...feed, provider: "RRTradeX Simulator", status: "simulated" },
    walletReconciliation: { mismatches: recon, ok: recon.length === 0 },
    generatedAt: new Date().toISOString(),
  };
});
