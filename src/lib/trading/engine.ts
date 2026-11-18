// Trading Service: order validation, lifecycle and simulated execution (SRS §5.4, §11).
// Every execution writes trade + ledger entry + wallet + holding + order state in ONE transaction.
import type { PoolClient } from "pg";
import { one, q, tx } from "../db";
import { getConfig } from "../config";
import { ApiError, conflict, notFound } from "../errors";
import { D, money, computeFees, executionPrice, applyBuy, applySell, type FeeModel } from "../money";
import { getQuote, isTradable, type Quote } from "../market/service";
import type { CurrentUser } from "../auth";

export interface OrderInput {
  instrumentId: string; side: "buy" | "sell"; orderType: "market" | "limit";
  quantity: string; limitPrice?: string | null; idempotencyKey: string;
}

async function event(c: PoolClient, orderId: string, type: string, detail: object = {}) {
  await c.query(`INSERT INTO order_events (order_id, event_type, detail) VALUES ($1,$2,$3)`, [orderId, type, JSON.stringify(detail)]);
}

async function rejectOrder(c: PoolClient, order: any, reason: string) {
  const { rows } = await c.query(
    `UPDATE orders SET status='rejected', reject_reason=$2, updated_at=now() WHERE order_id=$1 RETURNING *`, [order.order_id, reason]);
  await event(c, order.order_id, "rejected", { reason });
  return rows[0];
}

async function notify(c: PoolClient, userId: string, kind: string, title: string, body: string) {
  await c.query(`INSERT INTO notifications (user_id, kind, title, body) VALUES ($1,$2,$3,$4)`, [userId, kind, title, body]);
}

/** Estimated worst-case cash needed for a buy at price p (gross + fees). */
function estBuyCost(qty: InstanceType<typeof D>, p: InstanceType<typeof D>, fm: FeeModel) {
  const gross = money(qty.mul(p));
  return gross.plus(computeFees(gross, fm).total);
}

/**
 * Executes the remaining quantity of `order` at a price derived from `refPrice`.
 * Caller must hold a transaction. Returns the updated order and trade, or a rejection.
 */
export async function fillOrder(c: PoolClient, order: any, refPrice: string) {
  const sim = await getConfig("simulator");
  const fm = await getConfig<FeeModel>("fee_model");
  const { rows: [wallet] } = await c.query(`SELECT * FROM wallets WHERE user_id=$1 ORDER BY created_at LIMIT 1 FOR UPDATE`, [order.user_id]);
  if (!wallet) return { rejected: await rejectOrder(c, order, "No paper-trading wallet") };
  await c.query(`INSERT INTO holdings (user_id, instrument_id) VALUES ($1,$2) ON CONFLICT (user_id, instrument_id) DO NOTHING`, [order.user_id, order.instrument_id]);
  const { rows: [h] } = await c.query(`SELECT * FROM holdings WHERE user_id=$1 AND instrument_id=$2 FOR UPDATE`, [order.user_id, order.instrument_id]);

  const qty = new D(order.quantity).minus(order.filled_qty);
  const price = executionPrice(order.side, refPrice, Number(sim.slippage_bps), order.limit_price);
  const gross = money(qty.mul(price));
  const fees = computeFees(gross, fm).total;
  const bal = new D(wallet.available_balance);

  let newBal: InstanceType<typeof D>, newQty: InstanceType<typeof D>, newAvg: InstanceType<typeof D>;
  let realized: InstanceType<typeof D> | null = null, ledgerAmt: InstanceType<typeof D>, net: InstanceType<typeof D>;
  if (order.side === "buy") {
    const total = gross.plus(fees);
    if (bal.lt(total)) return { rejected: await rejectOrder(c, order, `Insufficient virtual funds: need ₹${total.toFixed(2)}, available ₹${bal.toFixed(2)}`) };
    const r = applyBuy(h.quantity, h.avg_buy_price, qty, gross, fees);
    newQty = r.quantity; newAvg = r.avg; newBal = bal.minus(total); ledgerAmt = total; net = total.neg();
  } else {
    if (new D(h.quantity).lt(qty)) return { rejected: await rejectOrder(c, order, `Insufficient holdings: have ${new D(h.quantity)}, need ${qty}`) };
    const r = applySell(h.quantity, h.avg_buy_price, qty, gross, fees);
    newQty = r.quantity; newAvg = r.avg; realized = r.realized; newBal = bal.plus(r.proceeds); ledgerAmt = r.proceeds; net = r.proceeds;
  }

  const { rows: [trade] } = await c.query(
    `INSERT INTO trades (order_id, user_id, instrument_id, side, execution_price, executed_qty, gross_amount, fees, net_amount, realized_pnl)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [order.order_id, order.user_id, order.instrument_id, order.side, price.toFixed(2), qty.toString(), gross.toFixed(2), fees.toFixed(2), net.toFixed(2), realized?.toFixed(2) ?? null]
  );
  await c.query(
    `INSERT INTO wallet_transactions (wallet_id, txn_type, direction, amount, balance_after, reference_type, reference_id, note)
     VALUES ($1,$2,$3,$4,$5,'trade',$6,$7)`,
    [wallet.wallet_id, order.side === "buy" ? "trade_buy" : "trade_sell", order.side === "buy" ? "debit" : "credit",
     ledgerAmt.toFixed(2), newBal.toFixed(2), trade.trade_id, `${order.side.toUpperCase()} ${qty} @ ${price.toFixed(2)} (fees ${fees.toFixed(2)})`]
  );
  await c.query(`UPDATE wallets SET available_balance=$2, updated_at=now() WHERE wallet_id=$1`, [wallet.wallet_id, newBal.toFixed(2)]);
  await c.query(
    `UPDATE holdings SET quantity=$2, avg_buy_price=$3, realized_pnl = realized_pnl + $4, updated_at=now() WHERE holding_id=$1`,
    [h.holding_id, newQty.toString(), newAvg.toFixed(4), (realized ?? new D(0)).toFixed(2)]
  );
  const { rows: [upd] } = await c.query(
    `UPDATE orders SET filled_qty=quantity, status='filled', updated_at=now() WHERE order_id=$1 RETURNING *`, [order.order_id]);
  if (order.status === "pending") await event(c, order.order_id, "accepted", {});
  await event(c, order.order_id, "filled", { trade_id: trade.trade_id, price: price.toFixed(2), qty: qty.toString(), fees: fees.toFixed(2), ref_price: refPrice });
  return { order: upd, trade };
}

export async function submitOrder(user: CurrentUser, input: OrderInput) {
  const sim = await getConfig("simulator");
  const fm = await getConfig<FeeModel>("fee_model");
  const inst = await one(`SELECT * FROM instruments WHERE instrument_id=$1`, [input.instrumentId]);
  if (!inst) throw notFound("Instrument not found");
  const qty = new D(input.quantity);
  if (!qty.isInteger() || qty.lte(0)) throw new ApiError(400, "validation_error", "Quantity must be a positive whole number of shares");
  if (qty.gt(sim.max_order_qty)) throw new ApiError(400, "validation_error", `Quantity cannot exceed ${sim.max_order_qty}`);
  const limit = input.orderType === "limit" ? new D(input.limitPrice ?? 0) : null;
  if (input.orderType === "limit" && (!limit || limit.lte(0) || limit.decimalPlaces() > 2))
    throw new ApiError(400, "validation_error", "Limit price must be a positive amount with at most 2 decimals");

  const quote = await getQuote(inst.instrument_id);

  const result = await tx(async (c) => {
    const validDays = Number(sim.limit_order_validity_days);
    const { rows: [ins] } = await c.query(
      `INSERT INTO orders (user_id, instrument_id, side, order_type, quantity, limit_price, status, idempotency_key, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,'pending',$7, CASE WHEN $4='limit' THEN now() + make_interval(days => $8::int) END)
       ON CONFLICT (user_id, idempotency_key) DO NOTHING RETURNING *`,
      [user.userId, inst.instrument_id, input.side, input.orderType, qty.toString(), limit?.toFixed(2) ?? null, input.idempotencyKey, validDays]
    );
    if (!ins) {
      const { rows: [ex] } = await c.query(`SELECT * FROM orders WHERE user_id=$1 AND idempotency_key=$2`, [user.userId, input.idempotencyKey]);
      if (ex.instrument_id !== inst.instrument_id || ex.side !== input.side || !new D(ex.quantity).eq(qty))
        throw conflict("Idempotency key was already used for a different order");
      return { order: ex, replayed: true };
    }
    await event(c, ins.order_id, "submitted", { quote_price: quote?.lastPrice ?? null, quote_status: quote?.feedStatus ?? "unavailable" });

    if (!inst.is_active) return { order: await rejectOrder(c, ins, "Instrument is not active for trading") };
    if (!isTradable(quote)) return { order: await rejectOrder(c, ins, `Market data is ${quote?.feedStatus ?? "unavailable"}; orders need a current quote`) };
    const ltp = new D(quote!.lastPrice);
    if (limit) {
      const dev = limit.minus(ltp).abs().div(ltp).mul(100);
      if (dev.gt(sim.limit_band_pct)) return { order: await rejectOrder(c, ins, `Limit price must be within ±${sim.limit_band_pct}% of the last price ₹${ltp.toFixed(2)}`) };
    }

    // Lock the wallet first: serialises this user's concurrent order submissions.
    const { rows: [wallet] } = await c.query(`SELECT * FROM wallets WHERE user_id=$1 ORDER BY created_at LIMIT 1 FOR UPDATE`, [user.userId]);
    if (!wallet) return { order: await rejectOrder(c, ins, "No paper-trading wallet") };

    if (input.side === "buy") {
      const p = limit ?? executionPrice("buy", ltp, Number(sim.slippage_bps));
      const need = estBuyCost(qty, p, fm);
      const { rows: open } = await c.query(
        `SELECT quantity - filled_qty AS rem, limit_price FROM orders WHERE user_id=$1 AND side='buy' AND status IN ('open','partially_filled')`, [user.userId]);
      const committed = open.reduce((s, o) => s.plus(estBuyCost(new D(o.rem), new D(o.limit_price), fm)), new D(0));
      const free = new D(wallet.available_balance).minus(committed);
      if (free.lt(need)) return { order: await rejectOrder(c, ins, `Insufficient virtual funds: estimated ₹${need.toFixed(2)} needed, ₹${D.max(free, 0).toFixed(2)} free`) };
    } else {
      const h = await c.query(`SELECT quantity FROM holdings WHERE user_id=$1 AND instrument_id=$2`, [user.userId, inst.instrument_id]);
      const held = new D(h.rows[0]?.quantity ?? 0);
      const { rows: [os] } = await c.query(
        `SELECT COALESCE(SUM(quantity - filled_qty),0) AS q FROM orders WHERE user_id=$1 AND instrument_id=$2 AND side='sell' AND status IN ('open','partially_filled')`,
        [user.userId, inst.instrument_id]);
      const free = held.minus(os.q);
      if (free.lt(qty)) return { order: await rejectOrder(c, ins, `Insufficient holdings: ${free} share(s) available to sell`) };
    }

    const crosses = !limit || (input.side === "buy" ? ltp.lte(limit) : ltp.gte(limit));
    if (crosses) {
      const r = await fillOrder(c, ins, ltp.toFixed(2));
      return r.rejected ? { order: r.rejected } : { order: r.order, trade: r.trade };
    }
    const { rows: [open] } = await c.query(`UPDATE orders SET status='open', updated_at=now() WHERE order_id=$1 RETURNING *`, [ins.order_id]);
    await event(c, ins.order_id, "accepted", { resting: true, limit_price: limit!.toFixed(2), last_price: ltp.toFixed(2) });
    return { order: open };
  });

  if ((result as any).trade) {
    const { snapshotPortfolio } = await import("../portfolio");
    snapshotPortfolio(user.userId).catch(() => {});
  }
  return { ...result, quote };
}

export async function cancelOrder(userId: string, orderId: string) {
  return tx(async (c) => {
    const { rows: [o] } = await c.query(`SELECT * FROM orders WHERE order_id=$1 AND user_id=$2 FOR UPDATE`, [orderId, userId]);
    if (!o) throw notFound("Order not found");
    if (!["open", "partially_filled"].includes(o.status)) throw conflict(`Order is ${o.status} and can no longer be cancelled`);
    await event(c, orderId, "cancel_requested", {});
    const { rows: [u] } = await c.query(`UPDATE orders SET status='cancelled', updated_at=now() WHERE order_id=$1 RETURNING *`, [orderId]);
    await event(c, orderId, "cancelled", {});
    return u;
  });
}

export async function expireOrders() {
  return tx(async (c) => {
    const { rows } = await c.query(
      `UPDATE orders SET status='expired', updated_at=now() WHERE status IN ('open','partially_filled') AND expires_at < now() RETURNING order_id, user_id`);
    for (const r of rows) {
      await event(c, r.order_id, "expired", {});
      await notify(c, r.user_id, "order", "Limit order expired", "An open limit order reached the end of its validity window without filling.");
    }
    return rows.length;
  });
}

/** Called on every fresh quote ingestion: fills resting limit orders whose price has been crossed. */
export async function matchOpenOrders(instrumentIds: string[], quotes: Map<string, Quote>) {
  if (!instrumentIds.length) return 0;
  const cands = await q(
    `SELECT o.order_id, o.instrument_id, o.side, o.limit_price, i.symbol FROM orders o JOIN instruments i USING (instrument_id)
      WHERE o.status='open' AND o.instrument_id = ANY($1) AND (o.expires_at IS NULL OR o.expires_at > now())`, [instrumentIds]);
  let filled = 0;
  for (const o of cands) {
    const qt = quotes.get(o.instrument_id);
    if (!isTradable(qt)) continue;
    const ltp = new D(qt!.lastPrice);
    const crosses = o.side === "buy" ? ltp.lte(o.limit_price) : ltp.gte(o.limit_price);
    if (!crosses) continue;
    await tx(async (c) => {
      const { rows: [locked] } = await c.query(`SELECT * FROM orders WHERE order_id=$1 AND status='open' FOR UPDATE SKIP LOCKED`, [o.order_id]);
      if (!locked) return;
      const r = await fillOrder(c, locked, ltp.toFixed(2));
      if (r.rejected) {
        await notify(c, locked.user_id, "order", `${o.symbol} limit order rejected`, r.rejected.reject_reason);
      } else {
        filled++;
        await notify(c, locked.user_id, "order", `${o.symbol} limit ${o.side} filled`,
          `${r.trade.executed_qty} share(s) at ₹${r.trade.execution_price} (fees ₹${r.trade.fees}).`);
        import("../portfolio").then((m) => m.snapshotPortfolio(locked.user_id)).catch(() => {});
      }
    });
  }
  return filled;
}
