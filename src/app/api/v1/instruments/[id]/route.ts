import { api } from "@/lib/api";
import { findInstrument } from "@/lib/instruments";
import { one } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { getQuote } from "@/lib/market/service";

export const GET = api<{ id: string }>({}, async ({ params, user }) => {
  const i = await findInstrument(params.id);
  if (!i) throw notFound("Instrument not found");
  const quote = await getQuote(i.instrument_id);
  const position = await one(`SELECT quantity, avg_buy_price, realized_pnl FROM holdings WHERE user_id=$1 AND instrument_id=$2`, [user.userId, i.instrument_id]);
  const open = await one(
    `SELECT COALESCE(SUM(quantity-filled_qty) FILTER (WHERE side='sell'),0) AS open_sell FROM orders WHERE user_id=$1 AND instrument_id=$2 AND status IN ('open','partially_filled')`,
    [user.userId, i.instrument_id]);
  return {
    instrument: { id: i.instrument_id, symbol: i.symbol, companyName: i.company_name, exchange: i.exchange, sector: i.sector, isActive: i.is_active },
    quote,
    position: position ? { quantity: position.quantity, avgBuyPrice: position.avg_buy_price, realizedPnl: position.realized_pnl, openSellQty: open!.open_sell } : null,
  };
});
