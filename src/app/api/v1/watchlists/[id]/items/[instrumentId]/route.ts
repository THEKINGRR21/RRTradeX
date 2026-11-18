import { api, isUuid } from "@/lib/api";
import { one } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { TRADING_ROLES } from "@/lib/auth";

export const DELETE = api<{ id: string; instrumentId: string }>({ roles: TRADING_ROLES }, async ({ user, params }) => {
  if (!isUuid(params.id) || !isUuid(params.instrumentId)) throw notFound();
  const r = await one(
    `DELETE FROM watchlist_items wi USING watchlists w WHERE wi.watchlist_id=w.watchlist_id AND w.user_id=$1 AND wi.watchlist_id=$2 AND wi.instrument_id=$3 RETURNING wi.item_id`,
    [user.userId, params.id, params.instrumentId]);
  if (!r) throw notFound("Item not found");
  return { ok: true };
});
