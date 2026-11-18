import { describe, expect, test } from "vitest";
import { D, computeFees, executionPrice, applyBuy, applySell, tick, money } from "@/lib/money";

describe("fee model", () => {
  test("brokerage is 0.03% capped at ₹20, plus 0.05% statutory", () => {
    expect(computeFees("10000").total.toFixed(2)).toBe("8.00"); // 3.00 + 5.00
    expect(computeFees("1000000").brokerage.toFixed(2)).toBe("20.00"); // capped
    expect(computeFees("1000000").statutory.toFixed(2)).toBe("500.00");
  });
  test("rounds half-up to paise", () => {
    expect(computeFees("1234.50").total.toFixed(2)).toBe("0.99"); // 0.37035→0.37, 0.61725→0.62
  });
});

describe("execution price", () => {
  test("market buy pays slippage, sell receives less, snapped to ₹0.05", () => {
    expect(executionPrice("buy", "1000", 5).toFixed(2)).toBe("1000.50");
    expect(executionPrice("sell", "1000", 5).toFixed(2)).toBe("999.50");
    expect(tick("123.47").toFixed(2)).toBe("123.45");
  });
  test("limit caps the price", () => {
    expect(executionPrice("buy", "1000", 5, "1000.20").toFixed(2)).toBe("1000.20");
    expect(executionPrice("sell", "1000", 5, "999.80").toFixed(2)).toBe("999.80");
  });
});

describe("cost basis & P&L (worked example from the Learning Centre)", () => {
  test("buy 10 @100 fee 1 → avg 100.10; sell 4 @110 fee 0.50 → realised 39.10", () => {
    const b = applyBuy(0, 0, 10, "1000", "1");
    expect(b.avg.toFixed(4)).toBe("100.1000");
    const unreal = money(new D(10).mul(110).minus(new D(10).mul(b.avg)));
    expect(unreal.toFixed(2)).toBe("99.00");
    const s = applySell(b.quantity, b.avg, 4, "440", "0.50");
    expect(s.realized.toFixed(2)).toBe("39.10");
    expect(s.quantity.toString()).toBe("6");
    expect(s.avg.toFixed(4)).toBe("100.1000"); // unchanged by sells
  });
  test("averaging up", () => {
    const a = applyBuy(10, "100", 10, "1200", "0");
    expect(a.avg.toFixed(4)).toBe("110.0000");
  });
  test("selling everything resets average", () => {
    const s = applySell(5, "200", 5, "1100", "1");
    expect(s.avg.toString()).toBe("0");
    expect(s.realized.toFixed(2)).toBe("99.00");
  });
});
