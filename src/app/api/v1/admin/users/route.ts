import { api } from "@/lib/api";
import { q } from "@/lib/db";

export const GET = api({ permission: "users:manage" }, async ({ req }) => {
  const sp = req.nextUrl.searchParams;
  const search = (sp.get("q") ?? "").trim().slice(0, 100);
  const role = sp.get("role"), status = sp.get("status");
  const rows = await q(
    `SELECT u.user_id, u.email, u.role, u.status, u.kyc_status, u.admin_permissions, u.created_at, u.last_login_at, p.full_name,
            w.available_balance, (SELECT count(*)::int FROM orders o WHERE o.user_id=u.user_id) AS orders
       FROM users u LEFT JOIN user_profiles p USING (user_id) LEFT JOIN wallets w ON w.user_id=u.user_id
      WHERE ($1='' OR u.email ILIKE '%'||$1||'%' OR p.full_name ILIKE '%'||$1||'%')
        AND ($2::text IS NULL OR u.role=$2) AND ($3::text IS NULL OR u.status=$3)
      ORDER BY u.created_at DESC LIMIT 200`, [search, role, status]);
  return { users: rows.map((r) => ({ id: r.user_id, email: r.email, fullName: r.full_name, role: r.role, status: r.status, kycStatus: r.kyc_status,
    permissions: r.admin_permissions, createdAt: r.created_at, lastLoginAt: r.last_login_at, walletBalance: r.available_balance, orders: r.orders })) };
});
