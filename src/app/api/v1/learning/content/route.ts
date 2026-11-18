import { api } from "@/lib/api";
import { q } from "@/lib/db";

// Browse published content with the caller's own progress (FR-LRN-03..05).
export const GET = api({}, async ({ user }) => {
  const rows = await q(
    `SELECT c.content_id, c.title, c.description, c.content_type, c.url, c.difficulty, c.duration_min, c.updated_at,
            cat.name AS category, cat.sort_order, p.progress_pct, p.completed_at
       FROM learning_contents c LEFT JOIN learning_categories cat USING (category_id)
       LEFT JOIN learning_progress p ON p.content_id=c.content_id AND p.user_id=$1
      WHERE c.status='published' ORDER BY cat.sort_order NULLS LAST, CASE c.difficulty WHEN 'beginner' THEN 0 WHEN 'intermediate' THEN 1 ELSE 2 END, c.title`, [user.userId]);
  return {
    contents: rows.map((r) => ({
      id: r.content_id, title: r.title, description: r.description, contentType: r.content_type, url: r.url, difficulty: r.difficulty,
      durationMin: r.duration_min, category: r.category ?? "General", progressPct: r.progress_pct ?? "0", completedAt: r.completed_at,
    })),
  };
});
