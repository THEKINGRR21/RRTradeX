import { z } from "zod";
import { api, body, isUuid } from "@/lib/api";
import { one } from "@/lib/db";
import { notFound } from "@/lib/errors";

// Progress only moves forward; completion is stamped once at 100% (FR-LRN-04).
export const PUT = api<{ id: string }>({}, async ({ req, user, params }) => {
  if (!isUuid(params.id)) throw notFound();
  const { progressPct } = await body(req, z.object({ progressPct: z.number().min(0).max(100) }));
  const c = await one(`SELECT 1 FROM learning_contents WHERE content_id=$1 AND status='published'`, [params.id]);
  if (!c) throw notFound("Content not found");
  const r = await one(
    `INSERT INTO learning_progress (user_id, content_id, progress_pct, completed_at) VALUES ($1,$2,$3::numeric, CASE WHEN $3::numeric>=100 THEN now() END)
     ON CONFLICT (user_id, content_id) DO UPDATE SET progress_pct=GREATEST(learning_progress.progress_pct, EXCLUDED.progress_pct),
       completed_at=COALESCE(learning_progress.completed_at, EXCLUDED.completed_at), updated_at=now()
     RETURNING progress_pct, completed_at`, [user.userId, params.id, Math.round(progressPct * 100) / 100]);
  return { progressPct: r!.progress_pct, completedAt: r!.completed_at };
});
