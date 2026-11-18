import { z } from "zod";
import { api, body, isUuid } from "@/lib/api";
import { one } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { TRADING_ROLES } from "@/lib/auth";

// Object-level authorisation: every query is scoped by user_id (FR-WAT-05).
export const PATCH = api<{ id: string }>({ roles: TRADING_ROLES }, async ({ req, user, params }) => {
  if (!isUuid(params.id)) throw notFound();
  const { name } = await body(req, z.object({ name: z.string().trim().min(1).max(60) }));
  const r = await one(`UPDATE watchlists SET name=$3 WHERE watchlist_id=$1 AND user_id=$2 RETURNING watchlist_id`, [params.id, user.userId, name]);
  if (!r) throw notFound("Watchlist not found");
  return { ok: true };
});

export const DELETE = api<{ id: string }>({ roles: TRADING_ROLES }, async ({ user, params }) => {
  if (!isUuid(params.id)) throw notFound();
  const r = await one(`DELETE FROM watchlists WHERE watchlist_id=$1 AND user_id=$2 RETURNING watchlist_id`, [params.id, user.userId]);
  if (!r) throw notFound("Watchlist not found");
  return { ok: true };
});
