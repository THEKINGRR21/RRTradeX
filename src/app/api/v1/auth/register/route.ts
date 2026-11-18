import { z } from "zod";
import { api, body, created } from "@/lib/api";
import { tx } from "@/lib/db";
import { hashPassword, createSession } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { audit } from "@/lib/audit";
import { conflict } from "@/lib/errors";

const Schema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(10, "Password must be at least 10 characters").max(128)
    .regex(/[A-Za-z]/, "Password must contain a letter").regex(/[0-9]/, "Password must contain a number"),
  fullName: z.string().trim().min(2).max(100),
  experienceLevel: z.enum(["beginner", "intermediate", "advanced"]).default("beginner"),
  acceptTerms: z.literal(true, { message: "You must accept the paper-trading terms" }),
});

export const POST = api({ auth: "public", rate: [10, 60 * 60_000] }, async ({ req, ip, requestId }) => {
  const b = await body(req, Schema);
  const cfg = await getConfig("paper_trading");
  const hash = await hashPassword(b.password);
  // Self-registration creates retail users; trader role is granted by an administrator.
  const userId = await tx(async (c) => {
    const ex = await c.query("SELECT 1 FROM users WHERE email=$1", [b.email]);
    if (ex.rowCount) throw conflict("An account with this email already exists");
    const { rows: [u] } = await c.query(`INSERT INTO users (email, password_hash, role) VALUES ($1,$2,'retail') RETURNING user_id`, [b.email, hash]);
    await c.query(`INSERT INTO user_profiles (user_id, full_name, experience_level) VALUES ($1,$2,$3)`, [u.user_id, b.fullName, b.experienceLevel]);
    const { rows: [w] } = await c.query(
      `INSERT INTO wallets (user_id, currency, available_balance, starting_balance) VALUES ($1,$2,$3,$3) RETURNING wallet_id`,
      [u.user_id, cfg.currency, cfg.starting_balance]);
    await c.query(
      `INSERT INTO wallet_transactions (wallet_id, txn_type, direction, amount, balance_after, reference_type, note)
       VALUES ($1,'initial_credit','credit',$2,$2,'system','Virtual paper-trading starting balance')`, [w.wallet_id, cfg.starting_balance]);
    await c.query(`INSERT INTO watchlists (user_id, name) VALUES ($1,'My Watchlist')`, [u.user_id]);
    await audit({ actor: u.user_id, action: "auth.register", targetType: "user", targetId: u.user_id, ip, requestId }, c);
    return u.user_id;
  });
  await createSession(userId, { ua: req.headers.get("user-agent"), ip });
  return created({ userId });
});
