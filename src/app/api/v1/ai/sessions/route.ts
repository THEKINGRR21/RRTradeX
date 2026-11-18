import { z } from "zod";
import { api, created } from "@/lib/api";
import { one, q } from "@/lib/db";

export const GET = api({}, async ({ user }) => ({
  sessions: await q(
    `SELECT s.session_id AS id, s.title, s.context_type, s.started_at,
            (SELECT max(created_at) FROM ai_messages m WHERE m.session_id=s.session_id) AS last_message_at
       FROM ai_sessions s WHERE s.user_id=$1 ORDER BY COALESCE((SELECT max(created_at) FROM ai_messages m WHERE m.session_id=s.session_id), s.started_at) DESC LIMIT 50`, [user.userId]),
}));

export const POST = api({}, async ({ req, user }) => {
  const raw = await req.json().catch(() => ({}));
  const b = z.object({ contextType: z.enum(["general", "learning", "portfolio", "market"]).default("general") }).parse(raw ?? {});
  const r = await one(`INSERT INTO ai_sessions (user_id, context_type) VALUES ($1,$2) RETURNING session_id, title, context_type, started_at`, [user.userId, b.contextType]);
  return created({ id: r!.session_id, title: r!.title, contextType: r!.context_type, startedAt: r!.started_at });
});
