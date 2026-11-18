import { one } from "./db";

const cache = new Map<string, { v: any; at: number }>();
const DEFAULTS: Record<string, any> = {
  paper_trading: { currency: "INR", starting_balance: "1000000.00" },
  fee_model: { brokerage_rate: "0.0003", brokerage_cap: "20.00", statutory_rate: "0.0005" },
  simulator: { slippage_bps: 5, quote_ttl_seconds: 15, stale_after_seconds: 120, limit_band_pct: 20, limit_order_validity_days: 7, max_order_qty: 100000 },
  limits: {
    retail: { watchlists: 5, items_per_watchlist: 25, active_alerts: 20 },
    trader: { watchlists: 20, items_per_watchlist: 100, active_alerts: 100 },
  },
};

export async function getConfig<T = any>(key: string): Promise<T> {
  const c = cache.get(key);
  if (c && Date.now() - c.at < 30_000) return c.v;
  const row = await one<{ value: any }>("SELECT value FROM platform_config WHERE key=$1", [key]);
  const v = { ...(DEFAULTS[key] ?? {}), ...(row?.value ?? {}) };
  cache.set(key, { v, at: Date.now() });
  return v;
}
export function invalidateConfig(key?: string) {
  if (key) cache.delete(key); else cache.clear();
}
export const CONFIG_KEYS = Object.keys(DEFAULTS);
