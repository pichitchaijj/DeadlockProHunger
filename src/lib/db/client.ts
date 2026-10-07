import 'server-only'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import type { Db } from './repo'
import * as schema from './schema'

/*
 * Server-only Postgres connection (Neon in production: use the POOLED connection string).
 * The database is optional: without DATABASE_URL every caller gets null and the site runs on the
 * live API alone, exactly as before the database existed.
 */

const globalForDb = globalThis as unknown as { __dphPool?: Pool; __dphDb?: Db }

export function getDb(): Db | null {
  const url = process.env.DATABASE_URL
  if (!url) return null
  if (!globalForDb.__dphDb) {
    // Small pool: serverless instances are many and short-lived; Neon's pooler multiplexes them.
    globalForDb.__dphPool = new Pool({ connectionString: url, max: 3, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 5_000 })
    globalForDb.__dphDb = drizzle(globalForDb.__dphPool, { schema }) as unknown as Db
  }
  return globalForDb.__dphDb
}
