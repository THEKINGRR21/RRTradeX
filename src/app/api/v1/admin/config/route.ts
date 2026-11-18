import { z } from "zod";
import { api, body } from "@/lib/api";
import { q, tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { invalidateConfig, CONFIG_KEYS } from "@/lib/config";

const dec = z.string().regex(/^\d+(\.\d+)?$/);
const SCHEMAS: Record<string, z.ZodTypeAny> = {
  paper_trading: z.object({ currency: z.literal("INR"), starting_balance: dec }).passthrough(),
  fee_model: z.object({ brokerage_rate: dec, brokerage_cap: dec, statutory_rate: dec }).passthrough(),
  simulator: z.object({ slippage_bps: z.number().min(0).max(100), quote_ttl_seconds: z.number().min(5).max(300), stale_after_seconds: z.number().min(30).max(3600),
    limit_band_pct: z.number().min(1).max(50), limit_order_validity_days: z.number().int().min(1).max(30), max_order_qty: z.number().int().min(1).max(10_000_000) }).passthrough(),
  limits: z.object({ retail: z.object({ watchlists: z.number().int().min(1), items_per_watchlist: z.number().int().min(1), active_alerts: z.number().int().min(1) }),
    trader: z.object({ watchlists: z.number().int().min(1), items_per_watchlist: z.number().int().min(1), active_alerts: z.number().int().min(1) }) }),
};

export const GET = api({ permission: "config:manage" }, async () => ({ config: await q(`SELECT key, value, updated_at FROM platform_config WHERE key = ANY($1) ORDER BY key`, [CONFIG_KEYS]) }));

export const PUT = api({ permission: "config:manage" }, async ({ req, user, ip, requestId }) => {
  const b = await body(req, z.object({ key: z.enum(["paper_trading", "fee_model", "simulator", "limits"]), value: z.unknown(), reason: z.string().trim().min(5).max(500) }));
  const value = SCHEMAS[b.key].parse(b.value);
  await tx(async (c) => {
    const { rows: [before] } = await c.query(`SELECT value FROM platform_config WHERE key=$1 FOR UPDATE`, [b.key]);
    await c.query(`INSERT INTO platform_config (key, value, updated_by, updated_at) VALUES ($1,$2,$3,now()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=now()`,
      [b.key, JSON.stringify(value), user.userId]);
    await audit({ actor: user.userId, action: "admin.config_update", targetType: "platform_config", targetId: b.key, reason: b.reason, metadata: { before: before?.value, after: value }, ip, requestId }, c);
  });
  invalidateConfig(b.key);
  return { ok: true };
});
