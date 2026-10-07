import type { StatScope } from '@/lib/analytics/scope'
import type { TrendDirection } from '@/components/data/TrendBadge'
import type { BuildCardProps } from '@/components/cards/BuildCard'
import type { MatchCardProps } from '@/components/cards/MatchCard'

/** View models for the Home page. Loaders produce these; components only render them. */

export type HomeSummary = {
  matchesAnalyzed: number
  /** Human label for the active window and rank scope, e.g. "Last 7 days · All ranks". */
  dataScopeLabel: string
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

export type PulseStat = {
  label: string
  value: number
  format: 'percent' | 'compact' | 'integer' | 'duration'
  subject?: string
  why: string
  featured?: boolean
  trend?: { direction: TrendDirection; delta?: number }
  sparkline?: { values: number[]; baseline?: number; summary: string }
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

export type HeroTrendList = {
  title: string
  metricLabel: string
  description: string
  heroes: HeroTrend[]
}

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
