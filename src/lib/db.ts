import { PrismaClient } from "@prisma/client";

function createPrisma(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  if (url.startsWith("file:")) {
    // Local SQLite — optional dependency, only available in dev
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
    const adapter = new PrismaBetterSqlite3({ url });
    return new PrismaClient({ adapter } as any);
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pool } = require("pg");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaPg } = require("@prisma/adapter-pg");
  // Validate the server certificate when SSL is in use (fixes MITM risk).
  // Skip SSL entirely for plain local Postgres URLs that omit sslmode.
  const usesSsl = url.includes("sslmode=") || url.includes(".azure.com") || url.includes("railway.app");
  const pool = new Pool({ connectionString: url, ssl: usesSsl ? { rejectUnauthorized: true } : undefined });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter } as any);
}

function getClient(): PrismaClient {
  const g = globalThis as any;
  if (!g._prisma) g._prisma = createPrisma();
  return g._prisma;
}

// Lazy proxy — PrismaClient is only instantiated on first actual DB call,
// not at module load time (prevents build-time crashes).
export const prisma = new Proxy({} as PrismaClient, {
  get(_, prop) {
    return (getClient() as any)[prop];
  },
});
