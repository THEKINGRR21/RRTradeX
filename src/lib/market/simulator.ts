// Deterministic simulated market-data provider.
// Price is a smooth, reproducible function of (symbol, time): a sum of multi-period
// sinusoids plus interpolated value-noise in log space. The same instant always yields
// the same price, so charts, quotes and fills are mutually consistent across instances.
import { D, tick, pct } from "../money";

function fnv1a(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function rand(seed: number, k: number) {
  let t = (seed ^ Math.imul(k | 0, 0x9e3779b1)) + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296; // [0,1)
}
const smooth = (x: number) => x * x * (3 - 2 * x);
function valueNoise(seed: number, x: number) {
  const i = Math.floor(x), f = x - i;
  const a = rand(seed, i) * 2 - 1, b = rand(seed, i + 1) * 2 - 1;
  return a + (b - a) * smooth(f);
}

export interface SimInstrument { symbol: string; sim_base_price: string; sim_volatility: string }

const DAY = 86400, TWO_PI = Math.PI * 2;

export function simPrice(inst: SimInstrument, tSec: number): number {
  const seed = fnv1a(inst.symbol);
  const v = Number(inst.sim_volatility);
  const ph = (k: number) => rand(seed, 1000 + k) * TWO_PI;
  const logP =
    Math.log(Number(inst.sim_base_price)) +
    v * 5.0 * Math.sin((TWO_PI * tSec) / (120 * DAY) + ph(1)) +
    v * 2.2 * Math.sin((TWO_PI * tSec) / (23 * DAY) + ph(2)) +
    v * 1.1 * Math.sin((TWO_PI * tSec) / (5.3 * DAY) + ph(3)) +
    v * 2.0 * valueNoise(seed ^ 0xa1, tSec / DAY) +
    v * 0.7 * valueNoise(seed ^ 0xb2, tSec / (3 * 3600)) +
    v * 0.25 * valueNoise(seed ^ 0xc3, tSec / 600) +
    v * 0.06 * valueNoise(seed ^ 0xd4, tSec / 60);
  return Math.exp(logP);
}

export function simQuote(inst: SimInstrument, at: Date) {
  const t = Math.floor(at.getTime() / 1000);
  const last = tick(simPrice(inst, t));
  const prev = tick(simPrice(inst, t - DAY));
  const seed = fnv1a(inst.symbol);
  const dailyBase = 2e5 + rand(seed, 77) * 6e6;
  const dayFrac = (t % DAY) / DAY;
  const volume = Math.round(dailyBase * (0.6 + 0.8 * rand(seed, Math.floor(t / DAY))) * Math.max(0.02, dayFrac));
  return {
    lastPrice: last.toFixed(2),
    prevClose: prev.toFixed(2),
    changePct: pct(last.minus(prev).div(prev).mul(100)).toFixed(4),
    volume: String(volume),
    quotedAt: new Date(t * 1000),
  };
}

export const RANGES = {
  "1D": { span: DAY, step: 300 },
  "1W": { span: 7 * DAY, step: 3600 },
  "1M": { span: 30 * DAY, step: 4 * 3600 },
  "6M": { span: 182 * DAY, step: DAY },
  "1Y": { span: 365 * DAY, step: DAY },
} as const;
export type Range = keyof typeof RANGES;

export function simHistory(inst: SimInstrument, range: Range, now = new Date()) {
  const { span, step } = RANGES[range];
  const end = Math.floor(now.getTime() / 1000);
  const start = Math.floor((end - span) / step) * step;
  const seed = fnv1a(inst.symbol);
  const pts: { t: string; close: string; volume: number }[] = [];
  for (let t = start; t <= end; t += step) {
    pts.push({
      t: new Date(t * 1000).toISOString(),
      close: tick(simPrice(inst, t)).toFixed(2),
      volume: Math.round((2e5 + rand(seed, 77) * 6e6) * (step / DAY) * (0.5 + rand(seed ^ 0x55, Math.floor(t / step)))),
    });
  }
  const lastT = new Date(end * 1000).toISOString();
  if (pts[pts.length - 1]?.t !== lastT) pts.push({ t: lastT, close: tick(simPrice(inst, end)).toFixed(2), volume: 0 });
  return pts;
}

export { D };
