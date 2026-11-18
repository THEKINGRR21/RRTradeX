import { z } from "zod";
import { api, body } from "@/lib/api";
import { q } from "@/lib/db";
import { NextResponse } from "next/server";
import { submitOrder } from "@/lib/trading/engine";
import { TRADING_ROLES } from "@/lib/auth";
import { badRequest } from "@/lib/errors";

const STATUSES = ["pending", "open", "partially_filled", "filled", "cancelled", "rejected", "expired"];

export const GET = api({ roles: TRADING_ROLES }, async ({ user, req }) => {
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  if (status && !STATUSES.includes(status)) throw badRequest("Unknown status");
  const limit = Math.min(200, Math.max(1, Number(sp.get("limit")) || 100));
  const rows = await q(
    `SELECT o.*, i.symbol, i.company_name,
            (SELECT COALESCE(SUM(fees),0) FROM trades t WHERE t.order_id=o.order_id) AS fees,
            (SELECT CASE WHEN SUM(executed_qty)>0 THEN SUM(execution_price*executed_qty)/SUM(executed_qty) END FROM trades t WHERE t.order_id=o.order_id) AS avg_fill_price
       FROM orders o JOIN instruments i USING (instrument_id)
      WHERE o.user_id=$1 AND ($2::text IS NULL OR o.status=$2) ORDER BY o.created_at DESC LIMIT $3`, [user.userId, status, limit]);
  return {
    orders: rows.map((o) => ({
      id: o.order_id, symbol: o.symbol, companyName: o.company_name, instrumentId: o.instrument_id, side: o.side, orderType: o.order_type,
      quantity: o.quantity, limitPrice: o.limit_price, filledQty: o.filled_qty, status: o.status, rejectReason: o.reject_reason,
      avgFillPrice: o.avg_fill_price ? Number(o.avg_fill_price).toFixed(2) : null, fees: o.fees, expiresAt: o.expires_at, createdAt: o.created_at, updatedAt: o.updated_at,
    })),
  };
});

const Schema = z.object({
  instrumentId: z.string().uuid(),
  side: z.enum(["buy", "sell"]),
  orderType: z.enum(["market", "limit"]),
  quantity: z.union([z.string(), z.number()]).transform(String).refine((v) => /^\d{1,7}$/.test(v), "Quantity must be a whole number"),
  limitPrice: z.union([z.string(), z.number()]).transform(String).optional().nullable(),
}).refine((b) => b.orderType === "market" ? !b.limitPrice : !!b.limitPrice, { message: "Limit price is required for limit orders only", path: ["limitPrice"] });

// Submit a paper order. Requires an Idempotency-Key header so client retries never duplicate it.
export const POST = api({ roles: TRADING_ROLES, rate: [30, 60_000] }, async ({ req, user }) => {
  const key = req.headers.get("idempotency-key");
  if (!key || !/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw badRequest("Idempotency-Key header (8-80 chars) is required");
  const b = await body(req, Schema);
  const r = await submitOrder(user, { ...b, limitPrice: b.limitPrice ?? null, idempotencyKey: key });
  const o = r.order;
  return NextResponse.json({
    order: { id: o.order_id, status: o.status, side: o.side, orderType: o.order_type, quantity: o.quantity, filledQty: o.filled_qty, limitPrice: o.limit_price, rejectReason: o.reject_reason, createdAt: o.created_at },
    trade: (r as any).trade ? { id: (r as any).trade.trade_id, executionPrice: (r as any).trade.execution_price, executedQty: (r as any).trade.executed_qty, fees: (r as any).trade.fees, netAmount: (r as any).trade.net_amount, realizedPnl: (r as any).trade.realized_pnl } : null,
    replayed: !!(r as any).replayed,
    paperTrading: true,
  }, { status: (r as any).replayed ? 200 : 201 });
});
