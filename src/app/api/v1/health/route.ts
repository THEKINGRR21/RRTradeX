import { api } from "@/lib/api";
import { one } from "@/lib/db";

export const GET = api({ auth: "public" }, async () => {
  const started = Date.now();
  let db = "ok";
  try { await one("SELECT 1"); } catch { db = "error"; }
  return { status: db === "ok" ? "ok" : "degraded", db, dbLatencyMs: Date.now() - started, mode: "paper-trading", marketData: "simulated", liveTrading: false, time: new Date().toISOString() };
});
