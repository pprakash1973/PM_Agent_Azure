// Admin Module Enhancements migration — Azure PostgreSQL
//   1. User.uid (nullable, unique) — AD/org key
//   2. Project delivery-owner cache columns
//   3. Backfill a UID for the surviving platform admin
// Idempotent. Run with: node scripts/migrate-azure-admin-enh.js
require("dotenv/config");
const { Pool } = require("pg");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || url.startsWith("file:")) {
    console.log("Skipping — DATABASE_URL is not a postgres URL. Set it to the Azure Postgres URL and re-run.");
    return;
  }
  const usesSsl = url.includes("sslmode=") || url.includes(".azure.com") || url.includes("railway.app");
  const pool = new Pool({ connectionString: url, ssl: usesSsl ? { rejectUnauthorized: true } : undefined });
  try {
    // 1. User.uid
    await pool.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "uid" TEXT`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS "User_uid_key" ON "User"("uid") WHERE "uid" IS NOT NULL`);
    console.log("✓ User.uid column + partial unique index");

    // 2. Project delivery-owner cache
    const projCols = [
      `"deliveryManagerId" TEXT`,
      `"deliveryManagerUid" TEXT`,
      `"clusterHeadId" TEXT`,
      `"clusterHeadUid" TEXT`,
    ];
    for (const col of projCols) {
      await pool.query(`ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS ${col}`);
    }
    await pool.query(`CREATE INDEX IF NOT EXISTS "Project_deliveryManagerId_idx" ON "Project"("deliveryManagerId")`);
    await pool.query(`CREATE INDEX IF NOT EXISTS "Project_clusterHeadId_idx" ON "Project"("clusterHeadId")`);
    console.log("✓ Project delivery-owner cache columns + indexes");

    // 3. Backfill admin UID (only if the admin has none yet)
    const admin = await pool.query(
      `SELECT id, "uid", email FROM "User" WHERE lower(email) = lower($1) LIMIT 1`,
      ["Admin@pmAgent.dev"]
    );
    if (admin.rows.length && !admin.rows[0].uid) {
      await pool.query(`UPDATE "User" SET "uid" = $1 WHERE id = $2`, ["ADMIN001", admin.rows[0].id]);
      console.log("✓ Backfilled admin UID = ADMIN001");
    } else if (admin.rows.length) {
      console.log(`• Admin already has UID = ${admin.rows[0].uid}`);
    } else {
      console.log("• No Admin@pmAgent.dev row found — skipping UID backfill");
    }

    console.log("\nMigration complete.");
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
