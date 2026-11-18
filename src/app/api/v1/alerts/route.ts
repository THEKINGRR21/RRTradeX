import { z } from "zod";
import { api, body, created } from "@/lib/api";
import { one, q } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { ApiError, notFound } from "@/lib/errors";
import { getQuotes } from "@/lib/market/service";
import { TRADING_ROLES } from "@/lib/auth";

export const GET = api({ roles: TRADING_ROLES }, async ({ user }) => {
  const rows = await q(
    `SELECT a.*, i.symbol, i.company_name FROM price_alerts a JOIN instruments i USING (instrument_id)
      WHERE a.user_id=$1 ORDER BY a.is_active DESC, a.created_at DESC LIMIT 200`, [user.userId]);
  const active = rows.filter((r) => r.is_active);
  const quotes = active.length ? await getQuotes([...new Set(active.map((r) => r.instrument_id))]) : new Map();
  return {
    alerts: rows.map((r) => ({
      id: r.alert_id, instrumentId: r.instrument_id, symbol: r.symbol, companyName: r.company_name, condition: r.condition,
      targetPrice: r.target_price, isActive: r.is_active, triggeredAt: r.triggered_at, triggeredPrice: r.triggered_price, createdAt: r.created_at,
      quote: quotes.get(r.instrument_id) ?? null,
    })),
  };
});

const Schema = z.object({
  instrumentId: z.string().uuid(),
  condition: z.enum(["above", "below"]),
  targetPrice: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "Enter a price with up to 2 decimals").refine((v) => Number(v) > 0, "Price must be positive"),
});

export const POST = api({ roles: TRADING_ROLES }, async ({ req, user }) => {
  const b = await body(req, Schema);
  const lim = (await getConfig("limits"))[user.role];
  const c = await one(`SELECT count(*)::int AS n FROM price_alerts WHERE user_id=$1 AND is_active`, [user.userId]);
  if (c!.n >= lim.active_alerts) throw new ApiError(422, "limit_reached", `Your plan allows up to ${lim.active_alerts} active alerts`);
  const i = await one(`SELECT 1 FROM instruments WHERE instrument_id=$1 AND is_active`, [b.instrumentId]);
  if (!i) throw notFound("Instrument not found");
  const r = await one(`INSERT INTO price_alerts (user_id, instrument_id, condition, target_price) VALUES ($1,$2,$3,$4) RETURNING alert_id`,
    [user.userId, b.instrumentId, b.condition, b.targetPrice]);
  return created({ id: r!.alert_id });
});
