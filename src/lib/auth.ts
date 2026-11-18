import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { one, pool, type Db } from "./db";
import { forbidden, unauthorized } from "./errors";

export const SESSION_COOKIE = "rrx_session";
const SESSION_HOURS = 12;

export type Role = "retail" | "trader" | "admin";
export type Permission = "users:manage" | "content:manage" | "audit:read" | "config:manage" | "reports:read" | "finance:adjust";
export interface CurrentUser {
  userId: string; email: string; role: Role; status: string; permissions: Permission[]; sessionId: string; fullName: string;
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export async function createSession(userId: string, meta: { ua?: string | null; ip?: string | null }, db: Db = pool()) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_HOURS * 3600_000);
  await db.query(
    `INSERT INTO auth_sessions (user_id, token_hash, user_agent, ip, expires_at) VALUES ($1,$2,$3,$4,$5)`,
    [userId, sha256(token), meta.ua?.slice(0, 300) ?? null, meta.ip ?? null, expires]
  );
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const tok = jar.get(SESSION_COOKIE)?.value;
  if (tok) await pool().query("UPDATE auth_sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL", [sha256(tok)]);
  jar.delete(SESSION_COOKIE);
}

export async function revokeAllSessions(userId: string, db: Db = pool()) {
  await db.query("UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL", [userId]);
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const jar = await cookies();
  const tok = jar.get(SESSION_COOKIE)?.value;
  if (!tok) return null;
  const row = await one(
    `SELECT s.session_id, s.last_seen_at, u.user_id, u.email, u.role, u.status, u.admin_permissions, p.full_name
       FROM auth_sessions s JOIN users u ON u.user_id = s.user_id
       LEFT JOIN user_profiles p ON p.user_id = u.user_id
      WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
    [sha256(tok)]
  );
  if (!row || row.status !== "active") return null;
  if (Date.now() - new Date(row.last_seen_at).getTime() > 5 * 60_000) {
    pool().query("UPDATE auth_sessions SET last_seen_at=now() WHERE session_id=$1", [row.session_id]).catch(() => {});
  }
  return {
    userId: row.user_id, email: row.email, role: row.role, status: row.status,
    permissions: row.admin_permissions ?? [], sessionId: row.session_id, fullName: row.full_name ?? "",
  };
}

export function assertRole(u: CurrentUser | null, roles?: Role[]): CurrentUser {
  if (!u) throw unauthorized();
  if (roles && !roles.includes(u.role)) throw forbidden();
  return u;
}
export function assertPermission(u: CurrentUser, p: Permission) {
  if (u.role !== "admin" || !u.permissions.includes(p)) throw forbidden(`Requires admin permission: ${p}`);
}
/** Roles allowed to hold a paper wallet and trade. Admin access never implies trading rights. */
export const TRADING_ROLES: Role[] = ["retail", "trader"];
