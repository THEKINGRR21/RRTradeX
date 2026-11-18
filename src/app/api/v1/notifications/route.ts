import { api } from "@/lib/api";
import { q } from "@/lib/db";

export const GET = api({}, async ({ user }) => ({
  notifications: await q(`SELECT notification_id AS id, kind, title, body, read_at, created_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`, [user.userId]),
}));
export const POST = api({}, async ({ user }) => {
  await q(`UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL`, [user.userId]);
  return { ok: true };
});
