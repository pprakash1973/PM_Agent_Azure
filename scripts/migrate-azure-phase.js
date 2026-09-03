// Adds currentPhase column to Azure PostgreSQL (production)
// Run with: node scripts/migrate-azure-phase.js
require("dotenv/config");
const { Pool } = require("pg");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || url.startsWith("file:")) {
    console.log("Skipping azure-phase migration — not a postgres URL");
    return;
  }
  const usesSsl = url.includes("sslmode=") || url.includes(".azure.com") || url.includes("railway.app");
  const pool = new Pool({ connectionString: url, ssl: usesSsl ? { rejectUnauthorized: true } : undefined });
  try {
    await pool.query(
      `ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "currentPhase" TEXT NOT NULL DEFAULT 'initiation'`
    );
    console.log("Migration applied: currentPhase column added (or already existed)");
  } finally {
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
