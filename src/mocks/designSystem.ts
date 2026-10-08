/**
 * DEMO DATA for the /design showcase only.
 * Fictional names and invented numbers, not Deadlock statistics.
 * Never import this from loaders or production pages.
 */
import type { StatScope } from '@/lib/analytics/scope'
import { rankFromBadge, type RankCatalog } from '@/lib/deadlock/rankAssets'

export const demoScope: StatScope = {
  window: { kind: 'days', days: 7 },
  rank: { kind: 'all' },
  sampleSize: 18_420,
  source: 'demo',
}

export const demoLowScope: StatScope = { ...demoScope, rank: { kind: 'text', text: 'Top band' }, sampleSize: 140 }

export type DemoHeroRow = {
  slug: string
  name: string
  winRate: number
  pickRate: number
  matches: number
  kda: number
}

export const demoHeroRows: DemoHeroRow[] = [
  { slug: 'sample-alpha', name: 'Sample Alpha', winRate: 0.538, pickRate: 0.214, matches: 18_420, kda: 3.1 },
  { slug: 'sample-bravo', name: 'Sample Bravo', winRate: 0.521, pickRate: 0.097, matches: 8_310, kda: 2.6 },
  { slug: 'sample-charlie', name: 'Sample Charlie', winRate: 0.497, pickRate: 0.162, matches: 13_905, kda: 2.2 },
  { slug: 'sample-delta', name: 'Sample Delta', winRate: 0.472, pickRate: 0.041, matches: 3_480, kda: 1.9 },
  { slug: 'sample-echo', name: 'Sample Echo', winRate: 0.583, pickRate: 0.004, matches: 140, kda: 2.8 },
]

/** Computed once at module load (not during render). */
/** Fictional rank tiers with no art: the showcase renders the original emblem fallback. */
const demoRankCatalog: RankCatalog = [{ tier: 4, name: 'Demo Tier', metal: 'Demo Metal', image: null }]
export const demoRanks = {
  player: rankFromBadge(demoRankCatalog, 46),
  match: rankFromBadge(demoRankCatalog, 44) ?? undefined,
}

export const demoTimes = {
  buildUpdatedAt: Date.now() - 2 * 86_400_000,
  matchStartedAt: Date.now() - 3 * 3_600_000,
}

export const demoTrend = [0.486, 0.491, 0.495, 0.502, 0.509, 0.514, 0.521]
