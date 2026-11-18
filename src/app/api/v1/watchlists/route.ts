import { z } from "zod";
import { api, body, created } from "@/lib/api";
import { one, q } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { getQuotes } from "@/lib/market/service";
import { ApiError } from "@/lib/errors";
import { TRADING_ROLES } from "@/lib/auth";

export const GET = api({ roles: TRADING_ROLES }, async ({ user }) => {
  const lists = await q(`SELECT watchlist_id, name, created_at FROM watchlists WHERE user_id=$1 ORDER BY created_at`, [user.userId]);
  const items = await q(
    `SELECT wi.watchlist_id, wi.added_at, i.instrument_id, i.symbol, i.company_name, i.sector FROM watchlist_items wi
       JOIN watchlists w USING (watchlist_id) JOIN instruments i USING (instrument_id) WHERE w.user_id=$1 ORDER BY wi.added_at`, [user.userId]);
  const quotes = items.length ? await getQuotes([...new Set(items.map((i) => i.instrument_id))]) : new Map();
  return {
    watchlists: lists.map((l) => ({
      id: l.watchlist_id, name: l.name, createdAt: l.created_at,
      items: items.filter((i) => i.watchlist_id === l.watchlist_id).map((i) => ({
        instrumentId: i.instrument_id, symbol: i.symbol, companyName: i.company_name, sector: i.sector, addedAt: i.added_at, quote: quotes.get(i.instrument_id) ?? null,
      })),
    })),
  };
});

export const POST = api({ roles: TRADING_ROLES }, async ({ req, user }) => {
  const { name } = await body(req, z.object({ name: z.string().trim().min(1).max(60) }));
  const lim = (await getConfig("limits"))[user.role];
  const c = await one(`SELECT count(*)::int AS n FROM watchlists WHERE user_id=$1`, [user.userId]);
  if (c!.n >= lim.watchlists) throw new ApiError(422, "limit_reached", `Your plan allows up to ${lim.watchlists} watchlists`);
  const r = await one(`INSERT INTO watchlists (user_id, name) VALUES ($1,$2) RETURNING watchlist_id`, [user.userId, name]);
  return created({ id: r!.watchlist_id, name });
});
