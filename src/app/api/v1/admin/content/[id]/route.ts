import { api, body, isUuid } from "@/lib/api";
import { tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notFound } from "@/lib/errors";
import { z } from "zod";

const Patch = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().max(500).optional(),
  body: z.string().max(50_000).optional(),
  contentType: z.enum(["article", "video", "tutorial"]).optional(),
  url: z.string().trim().url().refine((u) => /^https:\/\//.test(u), "URL must use https").or(z.literal("")).nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  durationMin: z.number().int().min(1).max(600).optional(),
  status: z.enum(["draft", "published", "unpublished", "archived"]).optional(),
});

export const PATCH = api<{ id: string }>({ permission: "content:manage" }, async ({ req, user, params, ip, requestId }) => {
  if (!isUuid(params.id)) throw notFound();
  const b = await body(req, Patch);
  return tx(async (c) => {
    const { rows: [before] } = await c.query(`SELECT title, status FROM learning_contents WHERE content_id=$1 FOR UPDATE`, [params.id]);
    if (!before) throw notFound("Content not found");
    const { rows: [after] } = await c.query(
      `UPDATE learning_contents SET title=COALESCE($2,title), description=COALESCE($3,description), body=COALESCE($4,body),
         content_type=COALESCE($5,content_type), url=CASE WHEN $6::text IS NULL THEN url ELSE NULLIF($6,'') END,
         category_id=CASE WHEN $7::boolean THEN $8::uuid ELSE category_id END, difficulty=COALESCE($9,difficulty),
         duration_min=COALESCE($10,duration_min), status=COALESCE($11,status), updated_at=now()
       WHERE content_id=$1 RETURNING title, status`,
      [params.id, b.title ?? null, b.description ?? null, b.body ?? null, b.contentType ?? null, b.url === undefined ? null : (b.url ?? ""),
       b.categoryId !== undefined, b.categoryId ?? null, b.difficulty ?? null, b.durationMin ?? null, b.status ?? null]);
    const action = b.status && b.status !== before.status ? `admin.content_${b.status === "published" ? "publish" : b.status === "archived" ? "archive" : b.status === "unpublished" ? "unpublish" : "draft"}` : "admin.content_edit";
    await audit({ actor: user.userId, action, targetType: "learning_content", targetId: params.id, metadata: { before, after, fields: Object.keys(b) }, ip, requestId }, c);
    return { ok: true };
  });
});
