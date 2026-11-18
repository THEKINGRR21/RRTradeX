import { api } from "@/lib/api";
import { one, q } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { TRADING_ROLES } from "@/lib/auth";
import { D } from "@/lib/money";

export const GET = api({ roles: TRADING_ROLES }, async ({ user, req }) => {
  const w = await one(`SELECT * FROM wallets WHERE user_id=$1 ORDER BY created_at LIMIT 1`, [user.userId]);
  if (!w) throw notFound("No paper-trading wallet");
  const limit = Math.min(500, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 200));
  const ledger = await q(`SELECT * FROM wallet_transactions WHERE wallet_id=$1 ORDER BY created_at DESC LIMIT $2`, [w.wallet_id, limit]);
  const rec = await one(
    `SELECT COALESCE(SUM(CASE WHEN direction='credit' THEN amount ELSE -amount END),0) AS ledger_balance FROM wallet_transactions WHERE wallet_id=$1`, [w.wallet_id]);
  return {
    wallet: { id: w.wallet_id, currency: w.currency, type: w.wallet_type, availableBalance: w.available_balance, startingBalance: w.starting_balance, updatedAt: w.updated_at },
    reconciliation: { ledgerBalance: rec!.ledger_balance, matches: new D(rec!.ledger_balance).eq(w.available_balance) },
    ledger: ledger.map((l) => ({ id: l.wallet_txn_id, type: l.txn_type, direction: l.direction, amount: l.amount, balanceAfter: l.balance_after, referenceType: l.reference_type, referenceId: l.reference_id, note: l.note, createdAt: l.created_at })),
    notice: "Virtual paper-trading funds only. Deposits and withdrawals are not available.",
  };
});
