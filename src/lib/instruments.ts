import { one } from "./db";
import { isUuid } from "./api";

export async function findInstrument(idOrSymbol: string) {
  return isUuid(idOrSymbol)
    ? one(`SELECT * FROM instruments WHERE instrument_id=$1`, [idOrSymbol])
    : one(`SELECT * FROM instruments WHERE symbol=$1 ORDER BY exchange LIMIT 1`, [idOrSymbol.toUpperCase()]);
}
