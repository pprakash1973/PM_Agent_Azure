/**
 * Direct DB access for the SystemSetting key-value table.
 * Uses better-sqlite3 locally and pg in production — bypasses Prisma
 * entirely so it works regardless of the generated client version.
 */

import path from "path";

function dbUrl() { return process.env.DATABASE_URL!; }
function isLocal() { return dbUrl()?.startsWith("file:"); }

function localDbPath(): string {
  const p = dbUrl().replace(/^file:/, "");
  return p.startsWith(".") ? path.resolve(process.cwd(), p) : p;
}

// Singleton pg pool for production
let _pool: any = null;
function pgPool() {
  if (!_pool) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pool } = require("pg");
    const url = dbUrl();
    const usesSsl = url.includes("sslmode=") || url.includes(".azure.com") || url.includes("railway.app");
    _pool = new Pool({ connectionString: url, ssl: usesSsl ? { rejectUnauthorized: true } : undefined });
  }
  return _pool;
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getSystemSetting(key: string): Promise<string | undefined> {
  if (isLocal()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3");
    const db = new Database(localDbPath());
    try {
      const row = db.prepare("SELECT value FROM SystemSetting WHERE key = ?").get(key) as
        | { value: string }
        | undefined;
      return row?.value;
    } finally {
      db.close();
    }
  }
  const res = await pgPool().query(
    'SELECT value FROM "SystemSetting" WHERE key = $1',
    [key]
  );
  return res.rows[0]?.value;
}

export async function getSystemSettings(keys: string[]): Promise<Map<string, string>> {
  if (!keys.length) return new Map();

  if (isLocal()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3");
    const db = new Database(localDbPath());
    try {
      const ph = keys.map(() => "?").join(", ");
      const rows = db
        .prepare(`SELECT key, value FROM SystemSetting WHERE key IN (${ph})`)
        .all(...keys) as { key: string; value: string }[];
      return new Map(rows.map((r) => [r.key, r.value]));
    } finally {
      db.close();
    }
  }

  const ph  = keys.map((_, i) => `$${i + 1}`).join(", ");
  const res = await pgPool().query(
    `SELECT key, value FROM "SystemSetting" WHERE key IN (${ph})`,
    keys
  );
  return new Map(res.rows.map((r: any) => [r.key as string, r.value as string]));
}

// ── Write ─────────────────────────────────────────────────────────────────────

export async function setSystemSetting(
  key: string,
  value: string,
  updatedBy?: string
): Promise<void> {
  const now = new Date().toISOString();

  if (isLocal()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3");
    const db = new Database(localDbPath());
    try {
      db.prepare(
        `INSERT INTO SystemSetting (key, value, updatedAt, updatedBy)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value     = excluded.value,
           updatedAt = excluded.updatedAt,
           updatedBy = excluded.updatedBy`
      ).run(key, value, now, updatedBy ?? null);
    } finally {
      db.close();
    }
    return;
  }

  await pgPool().query(
    `INSERT INTO "SystemSetting" (key, value, "updatedAt", "updatedBy")
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (key) DO UPDATE SET
       value       = EXCLUDED.value,
       "updatedAt" = EXCLUDED."updatedAt",
       "updatedBy" = EXCLUDED."updatedBy"`,
    [key, value, now, updatedBy ?? null]
  );
}
