import 'server-only'
import { unstable_cache } from 'next/cache'
import { stableKey } from '@/lib/cache/stableKey'
import { z } from 'zod'
import { TTL } from '@/lib/cache/ttl'
import { deadlockGet } from './client'

/*
 * Game builds and versioned assets for the Patch pages. Verified 2026-10-07 (docs/API.md § 4.22):
 * - /v1/assets/client-versions: every build with versioned assets, ascending, no dates (830 builds).
 * - /v1/assets/steam-info?client_version=: the build's `version_datetime` (UTC, no zone suffix). A build
 *   never changes, so its date is cached for a long time.
 * - /v1/assets/items (~6 MB) and /v1/assets/heroes (~1.9 MB) accept `client_version`: game values as
 *   parsed from that build's files. Both are over the 2 MB fetch-cache limit, so they are fetched
 *   uncached and only the computed diff is cached (features/patches/loaders.ts).
 * Assets use the default budget class (no per-IP analytics limit).
 */

/** Builds don't change; their dates are kept this long. */
const IMMUTABLE = 30 * 24 * 60 * 60

export function getClientVersions() {
  return deadlockGet('/v1/assets/client-versions', { schema: z.array(z.number()), revalidate: TTL.assets, tags: ['assets'] })
}

/** Build time (unix seconds) of one client version. */
export async function getBuildTime(version: number): Promise<number> {
  const info = await deadlockGet('/v1/assets/steam-info', {
    params: { client_version: version },
    schema: z.object({ client_version: z.number(), version_datetime: z.string() }),
    revalidate: IMMUTABLE,
    tags: ['assets'],
  })
  const ms = Date.parse(`${info.version_datetime}Z`)
  if (!Number.isFinite(ms)) throw new Error(`Unreadable build date for ${version}`)
  return Math.floor(ms / 1000)
}

/**
 * The newest build compiled before `unix` (binary search over the ascending version list, ~10 cached
 * steam-info lookups). Null when every build is newer.
 */
export const buildBefore = unstable_cache(
  stableKey('build-before', async (unix: number): Promise<{ version: number; builtAt: number } | null> => {
    const versions = await getClientVersions()
    let lo = 0
    let hi = versions.length - 1
    let found: { version: number; builtAt: number } | null = null
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const builtAt = await getBuildTime(versions[mid])
      if (builtAt < unix) {
        found = { version: versions[mid], builtAt }
        lo = mid + 1
      } else hi = mid - 1
    }
    return found
  }),
  ['build-before-v1'],
  // Hourly: for a timestamp near now, a newer build can still appear. Build dates themselves stay cached.
  { revalidate: TTL.patches, tags: ['assets'] },
)

const value = z.union([z.string(), z.number()]).nullish()

const itemSchema = z.object({
  id: z.number(),
  class_name: z.string(),
  name: z.string().nullish(),
  type: z.string(),
  heroes: z.array(z.number()).nullish(),
  item_slot_type: z.string().nullish(),
  shopable: z.boolean().nullish(),
  cost: z.number().nullish(),
  properties: z.record(z.string(), z.object({ value, label: z.string().nullish(), postfix: z.string().nullish() }).nullish()).nullish(),
  weapon_info: z.record(z.string(), z.unknown()).nullish(),
})

const heroSchema = z.object({
  id: z.number(),
  class_name: z.string(),
  name: z.string(),
  player_selectable: z.boolean().nullish(),
  disabled: z.boolean().nullish(),
  items: z.record(z.string(), z.string()).nullish(),
  starting_stats: z.record(z.string(), z.object({ value: z.union([z.number(), z.boolean(), z.string()]).nullish() }).nullish()).nullish(),
})

export type RawAssetItem = z.infer<typeof itemSchema>
export type RawAssetHero = z.infer<typeof heroSchema>

/** Items (abilities, weapons, upgrades) and heroes exactly as one build defines them. */
export async function getAssetSnapshot(version: number): Promise<{ items: RawAssetItem[]; heroes: RawAssetHero[] }> {
  const [items, heroes] = await Promise.all([
    deadlockGet('/v1/assets/items', { params: { client_version: version }, schema: z.array(itemSchema), revalidate: false, timeoutMs: 20_000 }),
    deadlockGet('/v1/assets/heroes', { params: { client_version: version }, schema: z.array(heroSchema), revalidate: false, timeoutMs: 20_000 }),
  ])
  return { items, heroes }
}
