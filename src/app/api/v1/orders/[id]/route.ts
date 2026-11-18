import { api, isUuid } from "@/lib/api";
import { one, q } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { TRADING_ROLES } from "@/lib/auth";

export const GET = api<{ id: string }>({ roles: TRADING_ROLES }, async ({ user, params }) => {
  if (!isUuid(params.id)) throw notFound();
  const o = await one(`SELECT o.*, i.symbol FROM orders o JOIN instruments i USING (instrument_id) WHERE order_id=$1 AND user_id=$2`, [params.id, user.userId]);
  if (!o) throw notFound("Order not found");
  const events = await q(`SELECT event_type, detail, created_at FROM order_events WHERE order_id=$1 ORDER BY event_id`, [params.id]);
  const trades = await q(`SELECT * FROM trades WHERE order_id=$1 ORDER BY executed_at`, [params.id]);
  return { order: o, events, trades };
});
