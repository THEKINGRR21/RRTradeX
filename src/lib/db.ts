import { Pool, type PoolClient, type QueryResultRow, types } from "pg";

// Return NUMERIC as string (never JS float) and BIGINT as string.
types.setTypeParser(1700, (v) => v);
types.setTypeParser(20, (v) => v);

declare global {
  // eslint-disable-next-line no-var
  var __rrxPool: Pool | undefined;
}

function makePool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  const local = /localhost|127\.0\.0\.1/.test(url);
  return new Pool({
    connectionString: url,
    ssl: local ? false : { rejectUnauthorized: false },
    max: Number(process.env.PG_POOL_MAX || (local ? 10 : 3)),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
}

export function pool(): Pool {
  if (!globalThis.__rrxPool) globalThis.__rrxPool = makePool();
  return globalThis.__rrxPool;
}

export type Db = Pick<PoolClient, "query">;

export async function q<T extends QueryResultRow = any>(sql: string, params: unknown[] = [], db: Db = pool()) {
  const r = await db.query<T>(sql, params as any[]);
  return r.rows;
}

export async function one<T extends QueryResultRow = any>(sql: string, params: unknown[] = [], db: Db = pool()) {
  const rows = await q<T>(sql, params, db);
  return rows[0] as T | undefined;
}

/** Run fn inside a single database transaction (BEGIN/COMMIT/ROLLBACK). */
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query("BEGIN");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    try { await c.query("ROLLBACK"); } catch {}
    throw e;
  } finally {
    c.release();
  }
}
