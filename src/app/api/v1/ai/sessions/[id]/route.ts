import { api, isUuid } from "@/lib/api";
import { one, q } from "@/lib/db";
import { notFound } from "@/lib/errors";

export const GET = api<{ id: string }>({}, async ({ user, params }) => {
  if (!isUuid(params.id)) throw notFound();
  const s = await one(`SELECT session_id, title FROM ai_sessions WHERE session_id=$1 AND user_id=$2`, [params.id, user.userId]);
  if (!s) throw notFound("Conversation not found");
  const messages = await q(`SELECT message_id AS id, sender, message_text AS text, created_at, model FROM ai_messages WHERE session_id=$1 ORDER BY created_at`, [params.id]);
  return { session: { id: s.session_id, title: s.title }, messages };
});

export const DELETE = api<{ id: string }>({}, async ({ user, params }) => {
  if (!isUuid(params.id)) throw notFound();
  const r = await one(`DELETE FROM ai_sessions WHERE session_id=$1 AND user_id=$2 RETURNING session_id`, [params.id, user.userId]);
  if (!r) throw notFound("Conversation not found");
  return { ok: true };
});
