import { z } from "zod";
import { api, body, isUuid } from "@/lib/api";
import { tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { forbidden, notFound } from "@/lib/errors";
import { revokeAllSessions } from "@/lib/auth";

const PERMS = ["users:manage", "content:manage", "audit:read", "config:manage", "reports:read", "finance:adjust"] as const;
const Schema = z.object({
  role: z.enum(["retail", "trader", "admin"]).optional(),
  status: z.enum(["active", "suspended", "closed"]).optional(),
  permissions: z.array(z.enum(PERMS)).optional(),
  kycStatus: z.enum(["not_collected", "self_declared"]).optional(),
  reason: z.string().trim().min(5, "Give a reason (min 5 characters)").max(500),
});

export const PATCH = api<{ id: string }>({ permission: "users:manage" }, async ({ req, user, params, ip, requestId }) => {
  if (!isUuid(params.id)) throw notFound();
  const b = await body(req, Schema);
  if (params.id === user.userId && (b.role || b.status || b.permissions)) throw forbidden("You cannot change your own role, status or permissions");
  return tx(async (c) => {
    const { rows: [before] } = await c.query(`SELECT user_id, role, status, admin_permissions, kyc_status FROM users WHERE user_id=$1 FOR UPDATE`, [params.id]);
    if (!before) throw notFound("User not found");
    const role = b.role ?? before.role;
    // finance:adjust is never implied; granting it requires the granter to hold it too.
    if (b.permissions?.includes("finance:adjust") && !user.permissions.includes("finance:adjust")) throw forbidden("Only holders of finance:adjust can grant it");
    const perms = role === "admin" ? (b.permissions ?? before.admin_permissions) : [];
    const { rows: [after] } = await c.query(
      `UPDATE users SET role=$2, status=$3, admin_permissions=$4, kyc_status=$5, updated_at=now() WHERE user_id=$1 RETURNING role, status, admin_permissions, kyc_status`,
      [params.id, role, b.status ?? before.status, perms, b.kycStatus ?? before.kyc_status]);
    if (after.status !== "active" || after.role !== before.role || JSON.stringify(after.admin_permissions) !== JSON.stringify(before.admin_permissions)) await revokeAllSessions(params.id, c);
    // A user promoted out of admin needs a wallet to trade.
    if (role !== "admin") {
      const { rows: [w] } = await c.query(`SELECT 1 FROM wallets WHERE user_id=$1`, [params.id]);
      if (!w) {
        const { rows: [cfg] } = await c.query(`SELECT value FROM platform_config WHERE key='paper_trading'`);
        const bal = cfg?.value?.starting_balance ?? "1000000.00";
        const { rows: [nw] } = await c.query(`INSERT INTO wallets (user_id, currency, available_balance, starting_balance) VALUES ($1,$2,$3,$3) RETURNING wallet_id`, [params.id, cfg?.value?.currency ?? "INR", bal]);
        await c.query(`INSERT INTO wallet_transactions (wallet_id, txn_type, direction, amount, balance_after, reference_type, note, created_by) VALUES ($1,'initial_credit','credit',$2,$2,'system','Virtual paper-trading starting balance',$3)`, [nw.wallet_id, bal, user.userId]);
      }
    }
    await audit({ actor: user.userId, action: "admin.user_update", targetType: "user", targetId: params.id, reason: b.reason, metadata: { before, after }, ip, requestId }, c);
    return { ok: true, user: after };
  });
});
