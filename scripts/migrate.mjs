// Applies SQL migrations in db/migrations in order, once each.
// Runs automatically during `npm run build` (Vercel) when DATABASE_URL is set.
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.warn("[migrate] DATABASE_URL not set — skipping migrations.");
  process.exit(0);
}

const ssl = /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false };
const client = new pg.Client({ connectionString: url, ssl });
await client.connect();
try {
  // Serialise concurrent deploys.
  await client.query("SELECT pg_advisory_lock(727001)");
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const dir = path.join(process.cwd(), "db", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const { rows } = await client.query("SELECT name FROM schema_migrations");
  const done = new Set(rows.map((r) => r.name));
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    console.log(`[migrate] applying ${f}`);
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations(name) VALUES ($1)", [f]);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }
  console.log("[migrate] up to date");
  if (process.env.SEED_ON_BUILD !== "false") {
    const { rows: c } = await client.query("SELECT count(*)::int AS n FROM instruments");
    if (c[0].n === 0) {
      console.log("[migrate] empty catalogue — running seed");
      await client.query("SELECT pg_advisory_unlock(727001)");
      await client.end();
      await import("./seed.mjs");
      process.exit(0);
    }
  }
} finally {
  try { await client.query("SELECT pg_advisory_unlock(727001)"); await client.end(); } catch {}
}
