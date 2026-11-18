import { api, isUuid } from "@/lib/api";
import { one } from "@/lib/db";
import { notFound } from "@/lib/errors";

export const GET = api<{ id: string }>({}, async ({ user, params }) => {
  if (!isUuid(params.id)) throw notFound();
  const r = await one(
    `SELECT c.*, cat.name AS category, p.progress_pct, p.completed_at, pu.full_name AS publisher
       FROM learning_contents c LEFT JOIN learning_categories cat USING (category_id)
       LEFT JOIN learning_progress p ON p.content_id=c.content_id AND p.user_id=$2
       LEFT JOIN user_profiles pu ON pu.user_id=c.published_by
      WHERE c.content_id=$1 AND (c.status='published' OR $3)`, [params.id, user.userId, user.permissions.includes("content:manage")]);
  if (!r) throw notFound("Content not found");
  return {
    content: { id: r.content_id, title: r.title, description: r.description, body: r.body, contentType: r.content_type, url: r.url, difficulty: r.difficulty,
      durationMin: r.duration_min, category: r.category, status: r.status, publisher: r.publisher ?? "RRTradeX", updatedAt: r.updated_at,
      progressPct: r.progress_pct ?? "0", completedAt: r.completed_at },
  };
});
