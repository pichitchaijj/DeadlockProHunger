import { sampleTier, type SampleTier } from '@/lib/analytics/sampleTier'
import { wilsonInterval, type Interval } from '@/lib/analytics/wilson'
import type { HeroLite } from '@/features/players/model'
import type { RankDisplay } from '@/lib/deadlock/rankAssets'

/*
 * Leaderboard rows. "Rank change" is measured, not inferred: the batch rank endpoint reports the
 * rank progress the player's latest ranked match changed (1,000 points per subrank) and the badge
 * they entered it with. A different badge after the match means a promotion or demotion.
 */

export type RankChange = { delta: number; badgeMove: 'up' | 'down' | null; at: number }

export function rankChange(r: {
  badge: number
  last_match?: { start_time: number; player_rank_initial_display_rank?: number | null; player_rank_desired_progress_change?: number | null } | null
}): RankChange | null {
  const m = r.last_match
  if (!m || m.player_rank_desired_progress_change == null || !r.badge) return null
  const before = m.player_rank_initial_display_rank ?? null
  return {
    delta: m.player_rank_desired_progress_change,
    badgeMove: before && before !== r.badge ? (r.badge > before ? 'up' : 'down') : null,
    at: m.start_time * 1000,
  }
}

/**
 * The data-basis line under the filters, as facts. The page words it from the catalog (leaderboard.notes)
 * with `boardNoteText`, so the hero name and counts stay data.
 */
export type BoardNote =
  | { kind: 'regional'; savedAt: number | null; hero: string | null; shown: number; top: number; ambiguous: number }
  | { kind: 'global'; minMatches: number; hero: string | null }
  | { kind: 'performance'; minMatches: number; hero: string | null; days: 7 | 30 }

type NoteTranslator = (key: string, values?: Record<string, string | number>) => string

/** Sentences joined by `separator` (none after a CJK full stop); `t` reads leaderboard.notes, `savedTime` formats the snapshot time (UTC). */
export function boardNoteText(note: BoardNote, t: NoteTranslator, savedTime: (ms: number) => string, winRateCaution = false, separator = ' '): string {
  const parts: string[] = []
  if (note.kind === 'regional') {
    if (note.savedAt !== null) parts.push(t('saved', { time: savedTime(note.savedAt) }))
    const counts = { shown: note.shown, top: note.top }
    parts.push(note.hero ? t('regionalHero', { ...counts, hero: note.hero }) : t('regional', counts))
    if (note.ambiguous) parts.push(t('ambiguous', { count: note.ambiguous }))
  } else if (note.kind === 'global') {
    parts.push(note.hero ? t('globalHero', { min: note.minMatches, hero: note.hero }) : t('global', { min: note.minMatches }))
  } else {
    const values = { min: note.minMatches, days: note.days }
    parts.push(note.hero ? t('performanceHero', { ...values, hero: note.hero }) : t('performance', values))
  }
  if (winRateCaution) parts.push(t('winRateCaution'))
  return parts.join(separator)
}

export type BoardRow = {
  position: number
  /** Null when the source has no name (empty Steam names exist); the page shows a fallback. */
  name: string | null
  accountId: number | null
  possibleAccounts: number
  topHeroes: HeroLite[]
  badge: number | null
  /** Current rank, resolved through lib/deadlock/rankAssets. */
  rank: RankDisplay | null
  change: RankChange | null
  /** Performance view / global view: tracked matches and the sorted value. */
  matches: number | null
  value: number | null
  /** Win-rate boards: interval and player-scale sample tier. */
  interval: Interval | null
  sample: SampleTier | null
}

/** Rows from the analytics scoreboard (global, account-based). */
export function scoreboardRows(
  rows: Array<{ rank: number; account_id: number; value: number; matches: number; badge?: number | null }>,
  ctx: { names: Map<number, string>; changes: Map<number, RankChange>; badges: Map<number, number>; rank: (badge: number | null) => RankDisplay | null; winRate: boolean },
): BoardRow[] {
  return rows.map((r) => {
    const badge = r.badge || ctx.badges.get(r.account_id) || null
    return {
      position: r.rank + 1,
      name: ctx.names.get(r.account_id)?.trim() || null,
      accountId: r.account_id,
      possibleAccounts: 1,
      topHeroes: [],
      badge,
      rank: ctx.rank(badge),
      change: ctx.changes.get(r.account_id) ?? null,
      matches: r.matches,
      value: r.value,
      interval: ctx.winRate ? wilsonInterval(Math.round(r.value * r.matches), r.matches) : null,
      sample: sampleTier(r.matches, 'player'),
    }
  })
}
