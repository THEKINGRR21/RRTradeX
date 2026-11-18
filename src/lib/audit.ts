import { pool, type Db } from "./db";

export async function audit(
  e: { actor?: string | null; action: string; targetType?: string; targetId?: string; reason?: string; metadata?: unknown; ip?: string | null; requestId?: string },
  db: Db = pool()
) {
  await db.query(
    `INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, reason, metadata, ip, request_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [e.actor ?? null, e.action, e.targetType ?? null, e.targetId ?? null, e.reason ?? null, JSON.stringify(e.metadata ?? {}), e.ip ?? null, e.requestId ?? null]
  );
}
