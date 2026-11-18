import { api } from "@/lib/api";
import { q } from "@/lib/db";
import { audit } from "@/lib/audit";

export const GET = api({ permission: "audit:read" }, async ({ req, user, ip, requestId }) => {
  const sp = req.nextUrl.searchParams;
  const action = sp.get("action")?.slice(0, 60) ?? "";
  const before = Number(sp.get("before")) || null;
  const rows = await q(
    `SELECT a.audit_id, a.action, a.target_type, a.target_id, a.reason, a.metadata, a.ip, a.request_id, a.created_at, u.email AS actor_email
       FROM audit_logs a LEFT JOIN users u ON u.user_id=a.actor_user_id
      WHERE ($1='' OR a.action ILIKE $1||'%') AND ($2::bigint IS NULL OR a.audit_id < $2)
      ORDER BY a.audit_id DESC LIMIT 100`, [action, before]);
  // Viewing audit logs is itself sensitive access and is recorded.
  if (!before) await audit({ actor: user.userId, action: "admin.audit_view", metadata: { filter: action }, ip, requestId });
  return { logs: rows, nextBefore: rows.length === 100 ? rows[rows.length - 1].audit_id : null };
});
