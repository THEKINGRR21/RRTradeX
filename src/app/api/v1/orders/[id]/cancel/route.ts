import { api, isUuid } from "@/lib/api";
import { notFound } from "@/lib/errors";
import { cancelOrder } from "@/lib/trading/engine";
import { TRADING_ROLES } from "@/lib/auth";

export const POST = api<{ id: string }>({ roles: TRADING_ROLES }, async ({ user, params }) => {
  if (!isUuid(params.id)) throw notFound();
  const o = await cancelOrder(user.userId, params.id);
  return { order: { id: o.order_id, status: o.status } };
});
