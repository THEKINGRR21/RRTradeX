import { api } from "@/lib/api";
import { notFound, badRequest } from "@/lib/errors";
import { getQuote } from "@/lib/market/service";
import { simHistory, RANGES, type Range } from "@/lib/market/simulator";
import { findInstrument } from "@/lib/instruments";

// Latest + historical quotes for charting (FR-MKT-05).
export const GET = api<{ id: string }>({}, async ({ params, req }) => {
  const i = await findInstrument(params.id);
  if (!i) throw notFound("Instrument not found");
  const range = (req.nextUrl.searchParams.get("range") ?? "1M").toUpperCase() as Range;
  if (!(range in RANGES)) throw badRequest(`range must be one of ${Object.keys(RANGES).join(", ")}`);
  const latest = await getQuote(i.instrument_id);
  return { symbol: i.symbol, range, latest, history: simHistory(i, range), source: "RRTradeX Simulator", feedStatus: "simulated" };
});
