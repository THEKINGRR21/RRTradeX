import { z } from "zod";
import { api, body, isUuid } from "@/lib/api";
import { one, q } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { generateReply } from "@/lib/ai/assistant";

export const maxDuration = 60;

export const POST = api<{ id: string }>({ rate: [20, 60_000] }, async ({ req, user, params }) => {
  if (!isUuid(params.id)) throw notFound();
  const { text } = await body(req, z.object({ text: z.string().trim().min(1).max(4000) }));
  // Session ownership is checked against the server-side identity (never a client-supplied user id).
  const s = await one(`SELECT session_id, title FROM ai_sessions WHERE session_id=$1 AND user_id=$2`, [params.id, user.userId]);
  if (!s) throw notFound("Conversation not found");
  const um = await one(`INSERT INTO ai_messages (session_id, sender, message_text) VALUES ($1,'user',$2) RETURNING message_id AS id, sender, message_text AS text, created_at`, [params.id, text]);
  if (s.title === "New conversation") await q(`UPDATE ai_sessions SET title=$2 WHERE session_id=$1`, [params.id, text.slice(0, 60)]);
  const r = await generateReply(user, params.id);
  const am = await one(
    `INSERT INTO ai_messages (session_id, sender, message_text, provider, model, tool_calls, tokens_in, tokens_out)
     VALUES ($1,'assistant',$2,$3,$4,$5,$6,$7) RETURNING message_id AS id, sender, message_text AS text, created_at, model`,
    [params.id, r.text, r.provider, r.model, JSON.stringify(r.toolLog), r.tokensIn, r.tokensOut]);
  return { userMessage: um, assistantMessage: am, toolsUsed: r.toolLog.map((t: any) => t.tool) };
});
