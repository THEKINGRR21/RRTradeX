import { z } from "zod";
import { api, body, created, isUuid } from "@/lib/api";
import { one } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { ApiError, notFound } from "@/lib/errors";
import { TRADING_ROLES } from "@/lib/auth";

export const POST = api<{ id: string }>({ roles: TRADING_ROLES }, async ({ req, user, params }) => {
  if (!isUuid(params.id)) throw notFound();
  const { instrumentId } = await body(req, z.object({ instrumentId: z.string().uuid() }));
  const w = await one(`SELECT (SELECT count(*)::int FROM watchlist_items WHERE watchlist_id=w.watchlist_id) AS n FROM watchlists w WHERE watchlist_id=$1 AND user_id=$2`, [params.id, user.userId]);
  if (!w) throw notFound("Watchlist not found");
  const lim = (await getConfig("limits"))[user.role];
  if (w.n >= lim.items_per_watchlist) throw new ApiError(422, "limit_reached", `A watchlist can hold up to ${lim.items_per_watchlist} instruments`);
  const i = await one(`SELECT 1 FROM instruments WHERE instrument_id=$1 AND is_active`, [instrumentId]);
  if (!i) throw notFound("Instrument not found");
  await one(`INSERT INTO watchlist_items (watchlist_id, instrument_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [params.id, instrumentId]);
  return created({ ok: true });
});
