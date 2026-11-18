import Decimal from "decimal.js";

// Fixed-precision decimal arithmetic for all monetary values (BR-18).
// Rounding rules:
//   money amounts  → 2 dp, ROUND_HALF_UP
//   prices         → nearest ₹0.05 tick (NSE-style), ROUND_HALF_UP
//   average price  → 4 dp, ROUND_HALF_UP
//   percentages    → 4 dp
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Dec = InstanceType<typeof D>;

export const dec = (v: Decimal.Value | null | undefined) => new D(v ?? 0);
export const money = (v: Decimal.Value) => new D(v).toDecimalPlaces(2, D.ROUND_HALF_UP);
export const avgPrice = (v: Decimal.Value) => new D(v).toDecimalPlaces(4, D.ROUND_HALF_UP);
export const pct = (v: Decimal.Value) => new D(v).toDecimalPlaces(4, D.ROUND_HALF_UP);
export const TICK = new D("0.05");
export const tick = (v: Decimal.Value) => {
  const r = new D(v).div(TICK).toDecimalPlaces(0, D.ROUND_HALF_UP).mul(TICK);
  return r.lt(TICK) ? TICK : r.toDecimalPlaces(2);
};

export interface FeeModel { brokerage_rate: string; brokerage_cap: string; statutory_rate: string }
export const DEFAULT_FEES: FeeModel = { brokerage_rate: "0.0003", brokerage_cap: "20.00", statutory_rate: "0.0005" };

/** Fees for one execution. Brokerage = min(cap, rate × turnover); statutory = rate × turnover. */
export function computeFees(gross: Decimal.Value, fm: FeeModel = DEFAULT_FEES) {
  const g = new D(gross);
  const brokerage = money(D.min(g.mul(fm.brokerage_rate), fm.brokerage_cap));
  const statutory = money(g.mul(fm.statutory_rate));
  return { brokerage, statutory, total: brokerage.plus(statutory) };
}

/** Simulated execution price: reference price ± slippage, snapped to tick, capped by limit price. */
export function executionPrice(side: "buy" | "sell", ref: Decimal.Value, slippageBps: number, limit?: Decimal.Value | null) {
  const s = new D(slippageBps).div(10000);
  let p = side === "buy" ? new D(ref).mul(new D(1).plus(s)) : new D(ref).mul(new D(1).minus(s));
  p = tick(p);
  if (limit != null) {
    const l = new D(limit);
    if (side === "buy" && p.gt(l)) p = l;
    if (side === "sell" && p.lt(l)) p = l;
  }
  return p;
}

/** Weighted-average cost after a buy; fees are capitalised into cost basis. */
export function applyBuy(oldQty: Decimal.Value, oldAvg: Decimal.Value, qty: Decimal.Value, gross: Decimal.Value, fees: Decimal.Value) {
  const oq = new D(oldQty), nq = oq.plus(qty);
  const cost = oq.mul(oldAvg).plus(gross).plus(fees);
  return { quantity: nq, avg: avgPrice(cost.div(nq)) };
}

/** Realised P&L on a sell using average cost; average price of remaining shares is unchanged. */
export function applySell(oldQty: Decimal.Value, avg: Decimal.Value, qty: Decimal.Value, gross: Decimal.Value, fees: Decimal.Value) {
  const nq = new D(oldQty).minus(qty);
  const proceeds = new D(gross).minus(fees);
  const realized = money(proceeds.minus(new D(qty).mul(avg)));
  return { quantity: nq, avg: nq.isZero() ? new D(0) : new D(avg), realized, proceeds: money(proceeds) };
}

export const fmt2 = (v: Decimal.Value) => new D(v).toFixed(2);
