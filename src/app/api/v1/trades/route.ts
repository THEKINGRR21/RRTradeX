import { api } from "@/lib/api";
import { q } from "@/lib/db";
import { TRADING_ROLES } from "@/lib/auth";

export const GET = api({ roles: TRADING_ROLES }, async ({ user, req }) => {
  const limit = Math.min(500, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 200));
  const rows = await q(
    `SELECT t.*, i.symbol, i.sector FROM trades t JOIN instruments i USING (instrument_id) WHERE t.user_id=$1 ORDER BY t.executed_at DESC LIMIT $2`, [user.userId, limit]);
  return {
    trades: rows.map((t) => ({
      id: t.trade_id, orderId: t.order_id, symbol: t.symbol, sector: t.sector, side: t.side, executionPrice: t.execution_price, executedQty: t.executed_qty,
      grossAmount: t.gross_amount, fees: t.fees, netAmount: t.net_amount, realizedPnl: t.realized_pnl, executedAt: t.executed_at,
    })),
  };
});
