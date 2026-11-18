import { z } from "zod";
import { api, body } from "@/lib/api";
import { one, q } from "@/lib/db";
import { getConfig } from "@/lib/config";

export const GET = api({}, async ({ user }) => {
  const p = await one(
    `SELECT u.user_id, u.email, u.role, u.status, u.kyc_status, u.admin_permissions, u.created_at, u.last_login_at,
            p.full_name, p.phone, p.risk_profile, p.experience_level
       FROM users u LEFT JOIN user_profiles p USING (user_id) WHERE u.user_id=$1`, [user.userId]);
  const unread = await one(`SELECT count(*)::int AS n FROM notifications WHERE user_id=$1 AND read_at IS NULL`, [user.userId]);
  const limits = user.role === "admin" ? null : (await getConfig("limits"))[user.role];
  return {
    user: {
      id: p.user_id, email: p.email, role: p.role, status: p.status, kycStatus: p.kyc_status,
      permissions: p.admin_permissions, createdAt: p.created_at, lastLoginAt: p.last_login_at,
      profile: { fullName: p.full_name, phone: p.phone, riskProfile: p.risk_profile, experienceLevel: p.experience_level },
    },
    canTrade: user.role !== "admin",
    limits, unreadNotifications: unread!.n, paperTrading: true,
  };
});

const Patch = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  phone: z.string().trim().regex(/^\+?[0-9 ]{7,16}$/, "Enter a valid phone number").or(z.literal("")).optional(),
  riskProfile: z.enum(["conservative", "moderate", "aggressive"]).optional(),
  experienceLevel: z.enum(["beginner", "intermediate", "advanced"]).optional(),
}).strict();

export const PATCH = api({}, async ({ req, user }) => {
  const b = await body(req, Patch);
  await q(
    `UPDATE user_profiles SET full_name=COALESCE($2,full_name), phone=CASE WHEN $3::text IS NULL THEN phone ELSE NULLIF($3,'') END,
       risk_profile=COALESCE($4,risk_profile), experience_level=COALESCE($5,experience_level), updated_at=now() WHERE user_id=$1`,
    [user.userId, b.fullName ?? null, b.phone ?? null, b.riskProfile ?? null, b.experienceLevel ?? null]);
  return { ok: true };
});
