import { api, isUuid } from "@/lib/api";
import { one } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { TRADING_ROLES } from "@/lib/auth";

export const DELETE = api<{ id: string }>({ roles: TRADING_ROLES }, async ({ user, params }) => {
  if (!isUuid(params.id)) throw notFound();
  const r = await one(`DELETE FROM price_alerts WHERE alert_id=$1 AND user_id=$2 RETURNING alert_id`, [params.id, user.userId]);
  if (!r) throw notFound("Alert not found");
  return { ok: true };
});
