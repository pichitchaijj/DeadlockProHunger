import type { ScopeRef, StatScope } from '@/lib/analytics/scope'
import type { TrendDirection } from '@/components/data/TrendBadge'
import type { BuildCardProps } from '@/components/cards/BuildCard'
import type { MatchCardProps } from '@/components/cards/MatchCard'

/**
 * View models for the Home page. Loaders produce these; components only render them. They carry data
 * and ids, not UI text: labels are translated when rendered (`home` messages), so the cached sections
 * are the same for every locale.
 */

export type HomeSummary = {
  matchesAnalyzed: number
  /** The active window and rank scope (worded when rendered, e.g. "Last 7 days · All ranks"). */
  dataScope: ScopeRef
  heroesTracked: number
  /** Every hero with matches in the window (Low sample included). */
  heroesTotal: number
}

/** Facts about the data source itself (deadlock-api.com), not about Deadlock's player base. */
export type HomeSource = {
  /** Matches the source adds per day. */
  matchesPerDay: number
  /** Player profiles the source knows (its `steam_profiles` table); null when not reported. */
  playerProfiles: number | null
}

export type PatchSnapshot = {
  title: string
  /** Unix ms (UTC day from the changelog title). */
  publishedAt: number
  /** Forum changelog post. */
  link: string | null
  /** The post's own preview (headline + opening text, truncated by the source); null if missing. */
  excerpt: { headline: string; text: string } | null
  /** Whether the post-patch window is still too short for strong conclusions. */
  limitedData: boolean
}

/** Which headline number a pulse card shows; its label is `home.pulse.<kind>`. */
export type PulseKind = 'highestWinRate' | 'mostPicked' | 'biggestRiser' | 'biggestFaller'

export type PulseStat = {
  kind: PulseKind
  value: number
  format: 'percent' | 'compact' | 'integer' | 'duration'
  subject?: string
  why: string
  featured?: boolean
  trend?: { direction: TrendDirection; delta?: number }
  sparkline?: { values: number[]; baseline?: number }
}

export type HeroTrend = {
  slug: string
  name: string
  imageSrc?: string
  /** The metric this list is about, as a ratio (win rate or pick rate). */
  value: number
  direction: TrendDirection
  /** Change vs the previous window, as a ratio (0.031 = +3.1pp). */
  delta: number
  matches: number
  history: number[]
}

/** One trend list; which one (and so its title and description) is the key it sits under in HomeMeta. */
export type HeroTrendList = {
  heroes: HeroTrend[]
}

export type HeroTrendKind = 'trending' | 'rising' | 'falling'

export type HomeMeta = {
  scope: StatScope
  summary: HomeSummary
  pulse: PulseStat[]
  trending: HeroTrendList
  rising: HeroTrendList
  falling: HeroTrendList
}
export type HomeBuild = Omit<BuildCardProps, 'className'>
export type HomeMatch = Omit<MatchCardProps, 'className'>
