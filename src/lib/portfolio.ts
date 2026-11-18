// Portfolio Service: valuation, realised/unrealised P&L and snapshots (SRS §5.5, BR-16/17).
// Cost basis: weighted average cost with buy fees capitalised. Realised P&L is booked on sells.
import { one, q } from "./db";
import { D, money } from "./money";
import { getQuotes, type Quote } from "./market/service";

export async function getPortfolio(userId: string) {
  const wallet = await one(`SELECT * FROM wallets WHERE user_id=$1 ORDER BY created_at LIMIT 1`, [userId]);
  const rows = await q(
    `SELECT h.*, i.symbol, i.company_name, i.sector, i.exchange FROM holdings h JOIN instruments i USING (instrument_id)
      WHERE h.user_id=$1 AND (h.quantity > 0 OR h.realized_pnl <> 0) ORDER BY i.symbol`, [userId]);
  const open = rows.filter((r) => new D(r.quantity).gt(0));
  const quotes: Map<string, Quote> = open.length ? await getQuotes(open.map((r) => r.instrument_id)) : new Map();

  let mv = new D(0), cost = new D(0), unreal = new D(0), dayChange = new D(0);
  let realized = rows.reduce((s, r) => s.plus(r.realized_pnl), new D(0));
  const disclosures: string[] = [];
  const holdings = open.map((r) => {
    const qt = quotes.get(r.instrument_id);
    const qty = new D(r.quantity);
    const c = money(qty.mul(r.avg_buy_price));
    const usable = qt && Number(qt.lastPrice) > 0 && qt.feedStatus !== "unavailable";
    if (!usable) disclosures.push(`${r.symbol}: no usable quote — valued at cost.`);
    else if (qt!.feedStatus === "stale") disclosures.push(`${r.symbol}: quote is stale (${qt!.ageSeconds}s old).`);
    const price = usable ? new D(qt!.lastPrice) : new D(r.avg_buy_price);
    const value = money(qty.mul(price));
    const u = value.minus(c);
    if (usable && qt!.prevClose) dayChange = dayChange.plus(qty.mul(price.minus(qt!.prevClose)));
    mv = mv.plus(value); cost = cost.plus(c); unreal = unreal.plus(u);
    return {
      instrumentId: r.instrument_id, symbol: r.symbol, companyName: r.company_name, sector: r.sector, exchange: r.exchange,
      quantity: qty.toString(), avgBuyPrice: new D(r.avg_buy_price).toFixed(2), costBasis: c.toFixed(2),
      lastPrice: price.toFixed(2), marketValue: value.toFixed(2), unrealizedPnl: u.toFixed(2),
      unrealizedPct: c.isZero() ? "0.00" : u.div(c).mul(100).toFixed(2), realizedPnl: new D(r.realized_pnl).toFixed(2),
      quote: qt ? { quotedAt: qt.quotedAt, source: qt.source, feedStatus: usable ? qt.feedStatus : "unavailable", changePct: qt.changePct } : null,
    };
  });
  for (const h of holdings) (h as any).weightPct = mv.isZero() ? "0.00" : new D(h.marketValue).div(mv).mul(100).toFixed(2);
  const cash = new D(wallet?.available_balance ?? 0);
  const total = cash.plus(mv);
  const start = new D(wallet?.starting_balance ?? 0);
  return {
    currency: wallet?.currency ?? "INR",
    paperTrading: true,
    summary: {
      cashBalance: cash.toFixed(2), holdingsValue: money(mv).toFixed(2), totalValue: money(total).toFixed(2),
      investedCost: money(cost).toFixed(2), unrealizedPnl: money(unreal).toFixed(2), realizedPnl: money(realized).toFixed(2),
      dayChange: money(dayChange).toFixed(2), startingBalance: start.toFixed(2),
      totalReturn: money(total.minus(start)).toFixed(2), totalReturnPct: start.isZero() ? "0.00" : total.minus(start).div(start).mul(100).toFixed(2),
    },
    holdings,
    closedPositions: rows.filter((r) => new D(r.quantity).isZero()).map((r) => ({ symbol: r.symbol, realizedPnl: new D(r.realized_pnl).toFixed(2) })),
    valuation: {
      method: "Market value = quantity × latest eligible quote. Cost basis = weighted average cost including buy fees. Realised P&L = sell proceeds after fees − quantity × average cost.",
      asOf: new Date().toISOString(),
      disclosures,
    },
  };
}

export async function snapshotPortfolio(userId: string) {
  const p = await getPortfolio(userId);
  const s = p.summary;
  await q(
    `INSERT INTO portfolio_snapshots (user_id, cash_balance, holdings_value, total_value, invested_cost, unrealized_pnl, realized_pnl)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [userId, s.cashBalance, s.holdingsValue, s.totalValue, s.investedCost, s.unrealizedPnl, s.realizedPnl]);
}
