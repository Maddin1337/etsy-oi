import { Pool } from "pg";
export * from "./schema.js";

export const DEFAULT_DATABASE_URL = "postgresql://root@/etsy_oi?host=/var/run/postgresql";

export function resolveDatabaseUrl(): string {
  return process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
}

export function createDbPool(connectionString = resolveDatabaseUrl()) {
  return new Pool({ connectionString });
}

export type DatabasePool = ReturnType<typeof createDbPool>;
