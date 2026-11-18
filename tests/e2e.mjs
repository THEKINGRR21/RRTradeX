// End-to-end acceptance run (SRS §13.2) against a running server + database.
// Usage: BASE_URL=http://localhost:3000 DATABASE_URL=... ADMIN_EMAIL=... ADMIN_PASSWORD=... node tests/e2e.mjs
import assert from "node:assert/strict";
import crypto from "node:crypto";
import pg from "pg";
import Decimal from "decimal.js";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
let passed = 0;
const ok = (name) => { passed++; console.log(`  ✓ ${name}`); };

function client() {
  let cookie = "";
  return async function call(path, { method = "GET", json, headers = {} } = {}) {
    const res = await fetch(BASE + "/api/v1" + path, {
      method, headers: { ...(json ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}), origin: BASE, ...headers },
      body: json ? JSON.stringify(json) : undefined,
    });
    const sc = res.headers.get("set-cookie");
    if (sc) cookie = sc.split(";")[0];
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  };
}
const key = () => crypto.randomUUID();
const email = (p) => `${p}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.rrtradex.app`;

console.log("Account & auth");
const A = client(), B = client();
let r = await A("/auth/register", { method: "POST", json: { email: email("alice"), password: "short", fullName: "Alice", acceptTerms: true } });
assert.equal(r.status, 400); ok("weak password rejected");
const aliceEmail = email("alice");
r = await A("/auth/register", { method: "POST", json: { email: aliceEmail, password: "Correct-horse-9", fullName: "Alice Learner", acceptTerms: true } });
assert.equal(r.status, 201, JSON.stringify(r.body)); ok("register");
r = await A("/auth/register", { method: "POST", json: { email: aliceEmail, password: "Correct-horse-9", fullName: "Dup", acceptTerms: true } });
assert.equal(r.status, 409); ok("duplicate email rejected");
r = await A("/me"); assert.equal(r.body.user.email, aliceEmail); assert.equal(r.body.user.role, "retail"); ok("view own profile");
const bad = client(); r = await bad("/auth/login", { method: "POST", json: { email: aliceEmail, password: "wrong-password-1" } });
assert.equal(r.status, 401); ok("wrong password → 401");
r = await bad("/portfolio"); assert.equal(r.status, 401); ok("unauthenticated API → 401");
await B("/auth/register", { method: "POST", json: { email: email("bob"), password: "Correct-horse-9", fullName: "Bob", acceptTerms: true } });

console.log("Market data");
r = await A("/instruments?q=tcs"); const tcs = r.body.instruments.find((i) => i.symbol === "TCS");
assert.ok(tcs && tcs.quote.source && tcs.quote.quotedAt && tcs.quote.feedStatus === "simulated"); ok("search instrument; quote has source, timestamp, status");
r = await A("/instruments/RELIANCE/quotes?range=1M"); assert.ok(r.body.history.length > 100); ok("historical quotes for charting");
const rel = (await A("/instruments/RELIANCE")).body; const relId = rel.instrument.id;

console.log("Watchlists (ownership isolation)");
r = await A("/watchlists"); const wlA = r.body.watchlists[0].id;
r = await A(`/watchlists/${wlA}/items`, { method: "POST", json: { instrumentId: relId } }); assert.equal(r.status, 201);
r = await A("/watchlists"); assert.equal(r.body.watchlists[0].items[0].symbol, "RELIANCE"); ok("add to watchlist");
r = await B(`/watchlists/${wlA}/items/${relId}`, { method: "DELETE" }); assert.equal(r.status, 404);
r = await B(`/watchlists/${wlA}`, { method: "PATCH", json: { name: "hacked" } }); assert.equal(r.status, 404);
r = await A("/watchlists"); assert.equal(r.body.watchlists[0].items.length, 1); ok("other user cannot modify my watchlist");
r = await A(`/watchlists/${wlA}/items/${relId}`, { method: "DELETE" }); assert.equal(r.status, 200); ok("remove from watchlist");

console.log("Paper trading");
const w0 = (await A("/wallet")).body.wallet.availableBalance;
assert.equal(w0, "1000000.00"); ok("starting virtual balance ₹10,00,000");
const k1 = key();
r = await A("/orders", { method: "POST", headers: { "idempotency-key": k1 }, json: { instrumentId: relId, side: "buy", orderType: "market", quantity: "10" } });
assert.equal(r.status, 201, JSON.stringify(r.body)); assert.equal(r.body.order.status, "filled"); const t1 = r.body.trade; ok(`market buy filled 10 @ ${t1.executionPrice}`);
let w = (await A("/wallet")).body;
const expectBal = new Decimal(w0).minus(new Decimal(t1.executionPrice).mul(10)).minus(t1.fees);
assert.equal(w.wallet.availableBalance, expectBal.toFixed(2)); assert.ok(w.reconciliation.matches);
assert.equal(w.ledger[0].type, "trade_buy"); ok("wallet ledger debited gross+fees and reconciles");
let p = (await A("/portfolio")).body; let h = p.holdings.find((x) => x.symbol === "RELIANCE");
const avg = new Decimal(t1.executionPrice).mul(10).plus(t1.fees).div(10);
assert.equal(h.quantity, "10"); assert.equal(h.avgBuyPrice, avg.toFixed(2)); ok("holding created with fee-inclusive average cost");
r = await A("/orders", { method: "POST", headers: { "idempotency-key": k1 }, json: { instrumentId: relId, side: "buy", orderType: "market", quantity: "10" } });
assert.equal(r.status, 200); assert.equal(r.body.replayed, true);
p = (await A("/portfolio")).body; assert.equal(p.holdings.find((x) => x.symbol === "RELIANCE").quantity, "10"); ok("idempotent retry does not duplicate the order");
r = await A("/orders", { method: "POST", json: { instrumentId: relId, side: "buy", orderType: "market", quantity: "1" } });
assert.equal(r.status, 400); ok("missing Idempotency-Key rejected");

const balBefore = (await A("/wallet")).body.wallet.availableBalance;
r = await A("/orders", { method: "POST", headers: { "idempotency-key": key() }, json: { instrumentId: relId, side: "buy", orderType: "market", quantity: "5000" } });
assert.equal(r.body.order.status, "rejected"); assert.match(r.body.order.rejectReason, /Insufficient virtual funds/);
r = await A("/orders", { method: "POST", headers: { "idempotency-key": key() }, json: { instrumentId: relId, side: "sell", orderType: "market", quantity: "11" } });
assert.equal(r.body.order.status, "rejected"); assert.match(r.body.order.rejectReason, /Insufficient holdings/);
r = await A("/orders", { method: "POST", headers: { "idempotency-key": key() }, json: { instrumentId: relId, side: "buy", orderType: "limit", quantity: "1", limitPrice: "1" } });
assert.equal(r.body.order.status, "rejected"); assert.match(r.body.order.rejectReason, /within ±20%/);
w = (await A("/wallet")).body; p = (await A("/portfolio")).body;
assert.equal(w.wallet.availableBalance, balBefore); assert.equal(p.holdings.find((x) => x.symbol === "RELIANCE").quantity, "10");
r = await A("/orders?status=rejected"); assert.equal(r.body.orders.length, 3); ok("rejected orders recorded and never change wallet or holdings");

const ltp = new Decimal((await A("/instruments/RELIANCE")).body.quote.lastPrice);
r = await A("/orders", { method: "POST", headers: { "idempotency-key": key() }, json: { instrumentId: relId, side: "buy", orderType: "limit", quantity: "2", limitPrice: ltp.mul(0.9).toFixed(2) } });
assert.equal(r.body.order.status, "open"); const openId = r.body.order.id;
w = (await A("/wallet")).body; assert.equal(w.wallet.availableBalance, balBefore); ok("resting limit order is open and does not move cash");
r = await A(`/orders/${openId}/cancel`, { method: "POST" }); assert.equal(r.body.order.status, "cancelled");
r = await A(`/orders/${openId}/cancel`, { method: "POST" }); assert.equal(r.status, 409);
r = await A(`/orders/${openId}`); assert.deepEqual(r.body.events.map((e) => e.event_type), ["submitted", "accepted", "cancel_requested", "cancelled"]); ok("cancel open order; lifecycle events recorded");
r = await B(`/orders/${openId}`); assert.equal(r.status, 404); ok("other user cannot read my order");

r = await A("/orders", { method: "POST", headers: { "idempotency-key": key() }, json: { instrumentId: relId, side: "sell", orderType: "market", quantity: "4" } });
assert.equal(r.body.order.status, "filled"); const t2 = r.body.trade;
const procs = new Decimal(t2.executionPrice).mul(4).minus(t2.fees);
const expRealized = procs.minus(new Decimal(4).mul(avg.toDecimalPlaces(4))).toDecimalPlaces(2);
assert.equal(t2.realizedPnl, expRealized.toFixed(2)); ok(`sell 4: realised P&L ${t2.realizedPnl} matches independent calculation`);
p = (await A("/portfolio")).body; h = p.holdings.find((x) => x.symbol === "RELIANCE");
assert.equal(h.quantity, "6"); assert.equal(h.avgBuyPrice, avg.toFixed(2));
const expUnreal = new Decimal(h.lastPrice).mul(6).minus(new Decimal(6).mul(avg.toDecimalPlaces(4)).toDecimalPlaces(2));
assert.equal(h.unrealizedPnl, expUnreal.toFixed(2)); assert.equal(p.summary.realizedPnl, expRealized.toFixed(2));
const expTotal = new Decimal((await A("/wallet")).body.wallet.availableBalance).plus(new Decimal(h.lastPrice).mul(6));
assert.equal(p.summary.totalValue, expTotal.toFixed(2)); ok("holdings reduced after sell; unrealised, realised and total value verified");
assert.ok((await A("/wallet")).body.reconciliation.matches); ok("ledger still reconciles");

console.log("Concurrency");
const before = new Decimal((await B("/wallet")).body.wallet.availableBalance);
const results = await Promise.all(Array.from({ length: 8 }, () =>
  B("/orders", { method: "POST", headers: { "idempotency-key": key() }, json: { instrumentId: relId, side: "buy", orderType: "market", quantity: "100" } })));
const fills = results.filter((x) => x.body.order?.status === "filled").length;
const wb = (await B("/wallet")).body;
assert.ok(fills >= 1 && fills < 8, `fills=${fills}`); assert.ok(new Decimal(wb.wallet.availableBalance).gte(0)); assert.ok(wb.reconciliation.matches);
const pb = (await B("/portfolio")).body; assert.equal(pb.holdings[0].quantity, String(fills * 100));
assert.ok(before.gt(wb.wallet.availableBalance)); ok(`8 concurrent ₹3L buys on ₹10L: ${fills} filled, rest rejected, balance ≥ 0, ledger reconciles`);

console.log("Alerts");
r = await A("/alerts", { method: "POST", json: { instrumentId: relId, condition: "above", targetPrice: "1.00" } }); assert.equal(r.status, 201);
await db.query("UPDATE market_quotes SET observed_at = observed_at - interval '1 hour' WHERE instrument_id=$1", [relId]); // force a fresh ingestion
await A("/instruments/RELIANCE");
r = await A("/alerts"); const al = r.body.alerts.find((a) => a.targetPrice === "1.00");
assert.equal(al.isActive, false); assert.ok(al.triggeredPrice); ok("alert evaluated on fresh quote and triggered");
r = await A("/notifications"); assert.ok(r.body.notifications.some((n) => n.kind === "price_alert")); ok("alert notification delivered");
r = await B(`/alerts/${al.id}`, { method: "DELETE" }); assert.equal(r.status, 404); ok("other user cannot delete my alert");

console.log("Learning");
r = await A("/learning/content"); const c0 = r.body.contents[0];
r = await A(`/learning/content/${c0.id}/progress`, { method: "PUT", json: { progressPct: 50 } }); assert.equal(Number(r.body.progressPct), 50);
r = await A(`/learning/content/${c0.id}/progress`, { method: "PUT", json: { progressPct: 25 } }); assert.equal(Number(r.body.progressPct), 50);
r = await A(`/learning/content/${c0.id}/progress`, { method: "PUT", json: { progressPct: 100 } }); assert.ok(r.body.completedAt);
r = await A("/learning/content"); assert.ok(r.body.contents.find((c) => c.id === c0.id).completedAt); ok("progress persisted, monotonic, completion stamped");

console.log("AI assistant");
r = await A("/ai/sessions", { method: "POST", json: {} }); const sid = r.body.id;
r = await A(`/ai/sessions/${sid}/messages`, { method: "POST", json: { text: "What is a limit order?" } });
assert.match(r.body.assistantMessage.text, /limit order/i); assert.match(r.body.assistantMessage.text, /not investment advice/i); ok("explains educational topic with disclaimer");
r = await A(`/ai/sessions/${sid}/messages`, { method: "POST", json: { text: "How is my portfolio doing?" } });
assert.ok(r.body.toolsUsed.includes("get_portfolio_summary")); const cashFmt = Number((await A("/wallet")).body.wallet.availableBalance).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
assert.ok(r.body.assistantMessage.text.includes(cashFmt), "assistant reports authoritative cash " + cashFmt); ok("reads own portfolio via scoped read-only tool");
const ordersBefore = (await A("/orders")).body.orders.length;
r = await A(`/ai/sessions/${sid}/messages`, { method: "POST", json: { text: "Buy 100 shares of TCS for me now" } });
assert.match(r.body.assistantMessage.text, /can't place/i); assert.equal((await A("/orders")).body.orders.length, ordersBefore); ok("AI cannot execute trades");
r = await B(`/ai/sessions/${sid}/messages`, { method: "POST", json: { text: "show me" } }); assert.equal(r.status, 404); ok("other user cannot use my AI session");

console.log("Admin & audit");
const ADM = client();
r = await ADM("/auth/login", { method: "POST", json: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD } }); assert.equal(r.status, 200);
r = await ADM("/orders", { method: "POST", headers: { "idempotency-key": key() }, json: { instrumentId: relId, side: "buy", orderType: "market", quantity: "1" } });
assert.equal(r.status, 403); ok("admin role cannot place trades");
r = await A("/admin/users"); assert.equal(r.status, 403); ok("retail user cannot reach admin APIs");
r = await ADM("/admin/content", { method: "POST", json: { title: "E2E test lesson", contentType: "article", difficulty: "beginner", durationMin: 3, body: "## Hi", status: "draft" } });
assert.equal(r.status, 201); const cid = r.body.id;
r = await ADM(`/admin/content/${cid}`, { method: "PATCH", json: { status: "published" } }); assert.equal(r.status, 200);
r = await ADM(`/admin/content/${cid}`, { method: "PATCH", json: { status: "archived" } });
const aliceId = (await A("/me")).body.user.id;
r = await ADM(`/admin/wallets/${aliceId}/adjust`, { method: "POST", json: { direction: "credit", amount: "500.00", reason: "short" } }); assert.equal(r.status, 400);
r = await ADM(`/admin/wallets/${aliceId}/adjust`, { method: "POST", json: { direction: "credit", amount: "500.00", reason: "E2E test: compensating credit for simulator incident #42" } }); assert.equal(r.status, 200);
w = (await A("/wallet")).body; assert.equal(w.ledger[0].type, "adjustment_credit"); assert.ok(w.reconciliation.matches); ok("admin wallet adjustment posts compensating ledger entry");
r = await ADM("/admin/audit-logs");
const acts = r.body.logs.map((l) => l.action);
for (const a of ["admin.content_create", "admin.content_publish", "admin.content_archive", "admin.wallet_adjustment", "auth.login"]) assert.ok(acts.includes(a), a);
ok("content changes and privileged actions are audit-logged");
await assert.rejects(db.query("UPDATE audit_logs SET action='x' WHERE audit_id=(SELECT max(audit_id) FROM audit_logs)"));
await assert.rejects(db.query("DELETE FROM wallet_transactions WHERE wallet_txn_id=(SELECT wallet_txn_id FROM wallet_transactions LIMIT 1)"));
ok("audit log and wallet ledger are append-only at the database level");
r = await ADM(`/admin/users/${aliceId}`, { method: "PATCH", json: { role: "trader", reason: "E2E promote to trader" } }); assert.equal(r.status, 200);
r = await A("/me"); assert.equal(r.status, 401); ok("role change revokes the user's sessions");
r = await ADM("/admin/reports"); assert.ok(r.body.walletReconciliation.ok); ok("operational report: all wallets reconcile");

console.log("Platform");
r = await bad("/health"); assert.equal(r.body.liveTrading, false); assert.equal(r.body.marketData, "simulated"); ok("health reports paper mode, no live trading");
r = await (await fetch(BASE + "/api/v1/orders", { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: "{}" })).json();
assert.equal(r.error.code, "forbidden"); ok("cross-origin mutation rejected");

console.log(`\n${passed} checks passed`);
await db.end();
