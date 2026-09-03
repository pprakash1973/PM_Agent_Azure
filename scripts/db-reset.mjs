/**
 * db-reset.mjs
 * Wipe all data from the Azure PostgreSQL database.
 * Reads DATABASE_URL from .env (or .env.local if --local flag passed).
 * Usage:
 *   node scripts/db-reset.mjs           # truncate all tables
 *   node scripts/db-reset.mjs --reseed  # truncate then re-run seed
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import pg from "pg";

const { Pool } = pg;
const __dir = dirname(fileURLToPath(import.meta.url));

function readEnv(file) {
  const path = resolve(__dir, "..", file);
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  const env = {};
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const useLocal = process.argv.includes("--local");
const reseed   = process.argv.includes("--reseed");
const envFile  = useLocal ? ".env.local" : ".env";

console.log(`\nReading ${envFile}...`);
const env = readEnv(envFile);
const url = env.DATABASE_URL;
if (!url || !url.startsWith("postgresql")) {
  console.error(`No valid PostgreSQL DATABASE_URL found in ${envFile}`);
  process.exit(1);
}
// Show only the host, never the password
const host = url.replace(/^[^@]+@/, "").split("/")[0];
console.log(`Connecting to: ${host}\n`);

const usesSsl = url.includes("sslmode=") || url.includes(".azure.com") || url.includes("railway.app");
const pool = new Pool({ connectionString: url, ssl: usesSsl ? { rejectUnauthorized: true } : undefined });

async function main() {
  const client = await pool.connect();
  try {
    // Get all user tables in the public schema (excluding Prisma internal tables)
    const { rows } = await client.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename NOT LIKE '_prisma%'
        AND tablename NOT LIKE 'pg_%'
      ORDER BY tablename;
    `);

    if (rows.length === 0) {
      console.log("No tables found — database may already be empty.");
      return;
    }

    const tableNames = rows.map(r => `"${r.tablename}"`).join(", ");
    console.log(`Found ${rows.length} tables:\n${rows.map(r => `  • ${r.tablename}`).join("\n")}\n`);

    console.log("Truncating all tables with CASCADE...");
    await client.query(`TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE;`);
    console.log(`\n✓ All ${rows.length} tables truncated. Database is empty.\n`);

    // Verify counts
    let totalRows = 0;
    for (const { tablename } of rows) {
      const r = await client.query(`SELECT COUNT(*) FROM "${tablename}";`);
      totalRows += parseInt(r.rows[0].count, 10);
    }
    console.log(`Row count across all tables after reset: ${totalRows} (expected 0)`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error("Reset failed:", err.message);
  process.exit(1);
});
