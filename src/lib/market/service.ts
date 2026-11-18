import { q, type Db, pool } from "../db";
import { getConfig } from "../config";
import { simQuote, type SimInstrument } from "./simulator";

export type FeedStatus = "live" | "delayed" | "stale" | "simulated" | "unavailable";
export interface Quote {
  instrumentId: string; lastPrice: string; prevClose: string | null; changePct: string | null; volume: string | null;
  quotedAt: string; source: string; feedStatus: FeedStatus; ageSeconds: number;
}

/** Market-data provider adapter. Swap in a licensed provider by implementing this interface. */
export interface MarketDataProvider {
  name: string;
  status: FeedStatus;
  fetch(instruments: (SimInstrument & { instrument_id: string })[], now: Date): Promise<
    { instrumentId: string; lastPrice: string; prevClose: string; changePct: string; volume: string; quotedAt: Date }[]
  >;
}

export const simulatedProvider: MarketDataProvider = {
  name: "RRTradeX Simulator",
  status: "simulated",
  async fetch(insts, now) {
    return insts.map((i) => ({ instrumentId: i.instrument_id, ...simQuote(i, now) }));
  },
};

function provider(): MarketDataProvider {
  // Only the simulator ships in this release (SRS §7.3: no implied real-time NSE/BSE data).
  return simulatedProvider;
}

/** Downstream consumers of fresh quotes: alert evaluation and limit-order matching. */
async function runQuoteConsumers(ids: string[], quotes: Map<string, Quote>) {
  const [{ evaluateAlerts }, { matchOpenOrders }] = await Promise.all([import("../alerts"), import("../trading/engine")]);
  for (const fn of [evaluateAlerts, matchOpenOrders]) {
    try { await fn(ids, quotes); } catch (e) { console.error(JSON.stringify({ level: "error", msg: "quote consumer failed", error: String(e) })); }
  }
}

function toQuote(r: any, staleAfter: number): Quote {
  const age = Math.max(0, Math.round((Date.now() - new Date(r.observed_at).getTime()) / 1000));
  return {
    instrumentId: r.instrument_id, lastPrice: r.last_price, prevClose: r.prev_close, changePct: r.change_pct, volume: r.volume,
    quotedAt: new Date(r.quoted_at).toISOString(), source: r.source,
    feedStatus: age > staleAfter ? "stale" : r.feed_status, ageSeconds: age,
  };
}

/**
 * Returns the latest quote per instrument, ingesting fresh provider quotes for any
 * instrument whose stored quote is older than the TTL. Provider failure never
 * relabels old data as current: those quotes come back marked stale/unavailable.
 */
export async function getQuotes(instrumentIds?: string[], opts: { db?: Db; skipListeners?: boolean } = {}): Promise<Map<string, Quote>> {
  const db = opts.db ?? pool();
  const cfg = await getConfig("simulator");
  const ttl = Number(cfg.quote_ttl_seconds), staleAfter = Number(cfg.stale_after_seconds);
  const insts = await q<any>(
    `SELECT i.instrument_id, i.symbol, i.sim_base_price, i.sim_volatility, lq.*
       FROM instruments i
       LEFT JOIN LATERAL (
         SELECT quote_id, last_price, prev_close, change_pct, volume, quoted_at, observed_at, source, feed_status
           FROM market_quotes m WHERE m.instrument_id = i.instrument_id ORDER BY quoted_at DESC LIMIT 1
       ) lq ON true
      WHERE i.is_active AND ($1::uuid[] IS NULL OR i.instrument_id = ANY($1))`,
    [instrumentIds ?? null], db
  );
  const out = new Map<string, Quote>();
  const due = insts.filter((r) => !r.quote_id || (Date.now() - new Date(r.observed_at).getTime()) / 1000 >= ttl);
  for (const r of insts) if (r.quote_id) out.set(r.instrument_id, toQuote(r, staleAfter));

  if (due.length) {
    const p = provider();
    try {
      const fresh = await p.fetch(due, new Date());
      if (fresh.length) {
        const vals: unknown[] = [];
        const rows = fresh.map((f, i) => {
          vals.push(f.instrumentId, f.lastPrice, f.prevClose, f.changePct, f.volume, f.quotedAt, p.name, p.status);
          const b = i * 8;
          return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8})`;
        });
        const ins = await q<any>(
          `INSERT INTO market_quotes (instrument_id,last_price,prev_close,change_pct,volume,quoted_at,source,feed_status)
           VALUES ${rows.join(",")} RETURNING *`, vals, db);
        for (const r of ins) out.set(r.instrument_id, toQuote(r, staleAfter));
        if (!opts.skipListeners) {
          await runQuoteConsumers(ins.map((r) => r.instrument_id), out);
        }
      }
    } catch (e) {
      console.error(JSON.stringify({ level: "error", msg: "market data provider failed", provider: p.name, error: String(e) }));
      for (const r of due) {
        if (!r.quote_id) out.set(r.instrument_id, {
          instrumentId: r.instrument_id, lastPrice: "0", prevClose: null, changePct: null, volume: null,
          quotedAt: new Date(0).toISOString(), source: p.name, feedStatus: "unavailable", ageSeconds: 0,
        });
      }
    }
  }
  return out;
}

export async function getQuote(instrumentId: string, db?: Db) {
  return (await getQuotes([instrumentId], { db })).get(instrumentId);
}

export const isTradable = (qt?: Quote) => !!qt && (qt.feedStatus === "live" || qt.feedStatus === "delayed" || qt.feedStatus === "simulated") && Number(qt.lastPrice) > 0;
