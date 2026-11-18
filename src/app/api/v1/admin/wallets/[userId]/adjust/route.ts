import { z } from "zod";
import { api, body, isUuid } from "@/lib/api";
import { tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { ApiError, forbidden, notFound } from "@/lib/errors";
import { D } from "@/lib/money";

// Exceptional financial adjustment (SRS §9.4, FR-ADM-05): restricted permission, mandatory reason,
// compensating ledger entry (never an edit) and an immutable audit record.
export const POST = api<{ userId: string }>({ permission: "finance:adjust", rate: [10, 60_000] }, async ({ req, user, params, ip, requestId }) => {
  if (!isUuid(params.userId)) throw notFound();
  if (params.userId === user.userId) throw forbidden("You cannot adjust your own wallet");
  const b = await body(req, z.object({
    direction: z.enum(["credit", "debit"]),
    amount: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/).refine((v) => Number(v) > 0, "Amount must be positive"),
    reason: z.string().trim().min(15, "A detailed justification (min 15 characters) is required").max(1000),
  }));
  return tx(async (c) => {
    const { rows: [w] } = await c.query(`SELECT * FROM wallets WHERE user_id=$1 ORDER BY created_at LIMIT 1 FOR UPDATE`, [params.userId]);
    if (!w) throw notFound("Wallet not found");
    const amt = new D(b.amount);
    const newBal = b.direction === "credit" ? new D(w.available_balance).plus(amt) : new D(w.available_balance).minus(amt);
    if (newBal.lt(0)) throw new ApiError(422, "insufficient_balance", "Adjustment would make the balance negative");
    const { rows: [t] } = await c.query(
      `INSERT INTO wallet_transactions (wallet_id, txn_type, direction, amount, balance_after, reference_type, note, created_by)
       VALUES ($1,$2,$3,$4,$5,'admin_adjustment',$6,$7) RETURNING wallet_txn_id`,
      [w.wallet_id, b.direction === "credit" ? "adjustment_credit" : "adjustment_debit", b.direction, amt.toFixed(2), newBal.toFixed(2), b.reason, user.userId]);
    await c.query(`UPDATE wallets SET available_balance=$2, updated_at=now() WHERE wallet_id=$1`, [w.wallet_id, newBal.toFixed(2)]);
    await audit({ actor: user.userId, action: "admin.wallet_adjustment", targetType: "wallet", targetId: w.wallet_id, reason: b.reason,
      metadata: { user_id: params.userId, direction: b.direction, amount: amt.toFixed(2), before: w.available_balance, after: newBal.toFixed(2), wallet_txn_id: t.wallet_txn_id }, ip, requestId }, c);
    return { ok: true, balance: newBal.toFixed(2) };
  });
});
