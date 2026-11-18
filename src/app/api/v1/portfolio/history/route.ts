import { api } from "@/lib/api";
import { q } from "@/lib/db";
import { TRADING_ROLES } from "@/lib/auth";

export const GET = api({ roles: TRADING_ROLES }, async ({ user }) => ({
  snapshots: await q(
    `SELECT captured_at, total_value, cash_balance, holdings_value, unrealized_pnl, realized_pnl FROM portfolio_snapshots
      WHERE user_id=$1 AND captured_at > now() - interval '365 days' ORDER BY captured_at LIMIT 2000`, [user.userId]),
}));
