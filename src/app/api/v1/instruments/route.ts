import { api } from "@/lib/api";
import { q } from "@/lib/db";
import { getQuotes } from "@/lib/market/service";

// Instrument catalogue + latest quote for each (FR-MKT-01..04).
export const GET = api({}, async ({ req }) => {
  const sp = req.nextUrl.searchParams;
  const search = (sp.get("q") ?? "").trim().slice(0, 50);
  const sector = sp.get("sector");
  const rows = await q(
    `SELECT instrument_id, symbol, company_name, exchange, sector, is_active FROM instruments
      WHERE is_active AND ($1 = '' OR symbol ILIKE '%'||$1||'%' OR company_name ILIKE '%'||$1||'%')
        AND ($2::text IS NULL OR sector = $2) ORDER BY symbol`, [search, sector]);
  const quotes = await getQuotes(rows.map((r) => r.instrument_id));
  const sectors = await q(`SELECT DISTINCT sector FROM instruments WHERE is_active ORDER BY sector`);
  return {
    instruments: rows.map((r) => ({
      id: r.instrument_id, symbol: r.symbol, companyName: r.company_name, exchange: r.exchange, sector: r.sector, quote: quotes.get(r.instrument_id) ?? null,
    })),
    sectors: sectors.map((s) => s.sector),
  };
});
