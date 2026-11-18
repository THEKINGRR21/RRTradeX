import { api } from "@/lib/api";
import { q } from "@/lib/db";
import { revokeAllSessions, destroySession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const GET = api({}, async ({ user }) => ({
  sessions: (await q(
    `SELECT session_id, user_agent, ip, created_at, last_seen_at, expires_at FROM auth_sessions
      WHERE user_id=$1 AND revoked_at IS NULL AND expires_at > now() ORDER BY last_seen_at DESC`, [user.userId]))
    .map((s) => ({ ...s, current: s.session_id === user.sessionId })),
}));

// Sign out everywhere.
export const DELETE = api({}, async ({ user, ip, requestId }) => {
  await revokeAllSessions(user.userId);
  await destroySession();
  await audit({ actor: user.userId, action: "auth.revoke_all_sessions", targetType: "user", targetId: user.userId, ip, requestId });
  return { ok: true };
});
