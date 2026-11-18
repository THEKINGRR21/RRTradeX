import { z } from "zod";
import { api, body } from "@/lib/api";
import { one, pool } from "@/lib/db";
import { createSession, verifyPassword, hashPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { ApiError, tooMany } from "@/lib/errors";

const Schema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(128) });
// Equalise timing for unknown emails by always running one bcrypt comparison.
let DUMMY: string | null = null;
const dummyHash = async () => (DUMMY ??= await hashPassword("rrtradex-timing-equaliser"));

export const POST = api({ auth: "public", rate: [20, 15 * 60_000] }, async ({ req, ip, requestId }) => {
  const b = await body(req, Schema);
  // Durable brute-force guard: 5 failures per email per 15 minutes.
  const fails = await one(`SELECT count(*)::int AS n FROM audit_logs WHERE action='auth.login_failed' AND target_id=$1 AND created_at > now() - interval '15 minutes'`, [b.email]);
  if (fails!.n >= 5) throw tooMany("Too many failed sign-in attempts. Try again in 15 minutes.");
  const u = await one(`SELECT user_id, password_hash, status FROM users WHERE email=$1`, [b.email]);
  const ok = await verifyPassword(b.password, u?.password_hash ?? (await dummyHash()));
  if (!u || !ok) {
    await audit({ action: "auth.login_failed", targetType: "email", targetId: b.email, ip, requestId });
    throw new ApiError(401, "invalid_credentials", "Email or password is incorrect");
  }
  if (u.status !== "active") throw new ApiError(403, "account_inactive", `This account is ${u.status}. Contact support.`);
  await createSession(u.user_id, { ua: req.headers.get("user-agent"), ip });
  await pool().query(`UPDATE users SET last_login_at=now() WHERE user_id=$1`, [u.user_id]);
  await audit({ actor: u.user_id, action: "auth.login", targetType: "user", targetId: u.user_id, ip, requestId });
  return { ok: true };
});
