import { loadEnvConfig } from '@next/env'
import { defineConfig } from 'drizzle-kit'

// drizzle-kit doesn't read .env files; load them the way Next does so DATABASE_URL comes from .env.local.
loadEnvConfig(process.cwd())

/** Migrations are generated from src/lib/db/schema.ts into drizzle/ (npm run db:generate). */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://localhost/deadlockprohunger' },
  strict: true,
})
