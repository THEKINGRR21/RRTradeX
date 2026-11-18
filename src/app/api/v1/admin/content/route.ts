import { z } from "zod";
import { api, body, created } from "@/lib/api";
import { one, q } from "@/lib/db";
import { audit } from "@/lib/audit";

const ContentSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(500).default(""),
  body: z.string().max(50_000).default(""),
  contentType: z.enum(["article", "video", "tutorial"]),
  url: z.string().trim().url().refine((u) => /^https:\/\//.test(u), "URL must use https").or(z.literal("")).nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  durationMin: z.number().int().min(1).max(600),
  status: z.enum(["draft", "published", "unpublished", "archived"]).default("draft"),
});

export const GET = api({ permission: "content:manage" }, async () => ({
  contents: await q(
    `SELECT c.content_id AS id, c.title, c.description, c.body, c.content_type, c.url, c.category_id, cat.name AS category, c.difficulty, c.duration_min, c.status, c.updated_at,
            (SELECT count(*)::int FROM learning_progress p WHERE p.content_id=c.content_id) AS learners,
            (SELECT count(*)::int FROM learning_progress p WHERE p.content_id=c.content_id AND p.completed_at IS NOT NULL) AS completions
       FROM learning_contents c LEFT JOIN learning_categories cat USING (category_id) ORDER BY c.updated_at DESC`),
}));

export const POST = api({ permission: "content:manage" }, async ({ req, user, ip, requestId }) => {
  const b = await body(req, ContentSchema);
  const r = await one(
    `INSERT INTO learning_contents (title, description, body, content_type, url, category_id, difficulty, duration_min, status, published_by)
     VALUES ($1,$2,$3,$4,NULLIF($5,''),$6,$7,$8,$9,$10) RETURNING content_id`,
    [b.title, b.description, b.body, b.contentType, b.url ?? "", b.categoryId ?? null, b.difficulty, b.durationMin, b.status, user.userId]);
  await audit({ actor: user.userId, action: "admin.content_create", targetType: "learning_content", targetId: r!.content_id, metadata: { title: b.title, status: b.status }, ip, requestId });
  return created({ id: r!.content_id });
});
