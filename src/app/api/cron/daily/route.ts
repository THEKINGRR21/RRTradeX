import { NextResponse, type NextRequest } from "next/server";
import { q } from "@/lib/db";
import { expireOrders } from "@/lib/trading/engine";
import { snapshotPortfolio } from "@/lib/portfolio";
import { getQuotes } from "@/lib/market/service";

export const maxDuration = 60;

// Vercel Cron (see vercel.json): expires stale limit orders, refreshes quotes (which runs
// alert + limit-order matching), takes daily portfolio snapshots and prunes old quotes.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: { code: "unauthorized", message: "Bad cron secret" } }, { status: 401 });
  const expired = await expireOrders();
  await getQuotes();
  const users = await q(`SELECT DISTINCT user_id FROM holdings WHERE quantity > 0`);
  for (const u of users) await snapshotPortfolio(u.user_id).catch(() => {});
  const pruned = await q(`WITH d AS (DELETE FROM market_quotes WHERE observed_at < now() - interval '7 days' RETURNING 1) SELECT count(*)::int AS n FROM d`);
  await q(`DELETE FROM auth_sessions WHERE expires_at < now() - interval '7 days'`);
  const out = { ok: true, expired, snapshots: users.length, prunedQuotes: pruned[0].n, at: new Date().toISOString() };
  console.log(JSON.stringify({ level: "info", svc: "cron", ...out }));
  return NextResponse.json(out);
}
