import { expect, test } from "vitest";
import { simPrice, simQuote, simHistory } from "@/lib/market/simulator";

const inst = { symbol: "TCS", sim_base_price: "4120", sim_volatility: "0.015" };
test("deterministic: same instant → same price on any instance", () => {
  expect(simPrice(inst, 1_800_000_000)).toBe(simPrice(inst, 1_800_000_000));
});
test("quote is consistent with history endpoint", () => {
  const now = new Date();
  const h = simHistory(inst, "1D", now);
  expect(h[h.length - 1].close).toBe(simQuote(inst, now).lastPrice);
});
test("prices stay within a sane band of base", () => {
  const ys = simHistory(inst, "1Y").map((p) => Number(p.close));
  expect(Math.min(...ys)).toBeGreaterThan(4120 * 0.6);
  expect(Math.max(...ys)).toBeLessThan(4120 * 1.6);
});
test("prices land on ₹0.05 ticks", () => {
  for (const p of simHistory(inst, "1W")) expect(Math.round(Number(p.close) * 100) % 5).toBe(0);
});
