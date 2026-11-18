// Alert Service: evaluates active price alerts against fresh quotes (FR-WAT-04).
import { q } from "./db";
import type { Quote } from "./market/service";

export async function evaluateAlerts(instrumentIds: string[], quotes: Map<string, Quote>) {
  if (!instrumentIds.length) return 0;
  let n = 0;
  for (const id of instrumentIds) {
    const qt = quotes.get(id);
    if (!qt || !["live", "delayed", "simulated"].includes(qt.feedStatus)) continue; // never trigger on stale data
    const fired = await q(
      `WITH hit AS (
         UPDATE price_alerts SET is_active=false, triggered_at=now(), triggered_price=$2
          WHERE instrument_id=$1 AND is_active
            AND ((condition='above' AND $2::numeric >= target_price) OR (condition='below' AND $2::numeric <= target_price))
          RETURNING alert_id, user_id, condition, target_price)
       INSERT INTO notifications (user_id, kind, title, body)
       SELECT h.user_id, 'price_alert', i.symbol || ' is ' || h.condition || ' ₹' || h.target_price,
              i.symbol || ' traded at ₹' || $2 || ' (' || $3 || ' quote, ' || to_char($4::timestamptz AT TIME ZONE 'Asia/Kolkata','DD Mon HH24:MI') || ' IST).'
         FROM hit h JOIN instruments i ON i.instrument_id=$1
       RETURNING notification_id`,
      [id, qt.lastPrice, qt.feedStatus, qt.quotedAt]);
    n += fired.length;
  }
  return n;
}
