import { MIN_EFFECT } from '@/lib/analytics/insights'
import { sampleTier, type SampleTier } from '@/lib/analytics/sampleTier'
import { wilsonInterval, type Interval } from '@/lib/analytics/wilson'
import type { MetaHero } from '@/features/meta/model'
import type { DayPoint } from '@/features/hero/model'

export type PeerHero = Pick<MetaHero, 'id' | 'slug' | 'name' | 'iconUrl' | 'role' | 'wins' | 'matches' | 'winRate' | 'interval' | 'sample' | 'pickRate'>

/** A hero offered in the picker (every active hero, whether or not it has matches in the scope). */
export type PickerHero = { id: number; slug: string; name: string; role: string | null; iconUrl: string | null }

/** `position`: 1-based win-rate rank among heroes with enough data; null for Low-sample rows. */
export type PeerRow = PeerHero & { selected: boolean; position: number | null }

export type PeerComparison = {
  /**
   * The group actually used. `role` was asked for but the hero has no role upstream → `all`, so the
   * UI never claims "same role" while showing every hero.
   */
  group: 'role' | 'all'
  /** Whether a same-role comparison is possible at all (the hero has a role). */
  roleAvailable: boolean
  /** The role compared within, or null when comparing with every hero. */
  role: string | null
  /** Heroes with enough data first (by win rate), then Low-sample heroes (by matches), muted in the UI. */
  rows: PeerRow[]
  /** Heroes in the group whose sample isn't Low: the only ones ranked. */
  ranked: number
  /** 1-based win-rate and pick-rate position among ranked heroes; null when the hero itself is Low sample. */
  winRatePosition: number | null
  pickRatePosition: number | null
  /** Every other hero in the group pooled together (null when there is no other hero). */
  rest: { wins: number; matches: number; winRate: number; interval: Interval; sample: SampleTier } | null
  /**
   * The hero against the rest of the group, by the project's "clear difference" rule: neither side
   * Low sample, 95% intervals separated, and a gap of at least MIN_EFFECT. Otherwise `within`.
   * Null when there is nothing to compare (hero Low sample or no rest).
   */
  versusRest: 'higher' | 'lower' | 'within' | null
}

/**
 * Where a hero stands among its peers in the same scope (same window and rank as every other number
 * on the page). Uses only the Meta model's per-hero totals; nothing is estimated.
 */
export function peerComparison(heroes: PeerHero[], heroId: number, group: 'role' | 'all'): PeerComparison | null {
  const self = heroes.find((h) => h.id === heroId)
  if (!self) return null
  const role = group === 'role' ? self.role : null
  const members = role ? heroes.filter((h) => h.role === role) : heroes

  const enough = members.filter((h) => h.sample !== 'low').sort((a, b) => b.winRate - a.winRate)
  const low = members.filter((h) => h.sample === 'low').sort((a, b) => b.matches - a.matches)
  const rows = [...enough.map((h, i) => ({ ...h, position: i + 1 })), ...low.map((h) => ({ ...h, position: null }))].map((h) => ({ ...h, selected: h.id === heroId }))

  const selfRanked = self.sample !== 'low'
  const winRatePosition = selfRanked ? enough.findIndex((h) => h.id === heroId) + 1 : null
  const pickRatePosition = selfRanked ? [...enough].sort((a, b) => b.pickRate - a.pickRate).findIndex((h) => h.id === heroId) + 1 : null

  const others = members.filter((h) => h.id !== heroId)
  const wins = others.reduce((n, h) => n + h.wins, 0)
  const matches = others.reduce((n, h) => n + h.matches, 0)
  const rest = matches > 0 ? { wins, matches, winRate: wins / matches, interval: wilsonInterval(wins, matches), sample: sampleTier(matches) } : null

  let versusRest: PeerComparison['versusRest'] = null
  if (selfRanked && rest && rest.sample !== 'low') {
    const gap = self.winRate - rest.winRate
    if (self.interval.low > rest.interval.high && gap >= MIN_EFFECT) versusRest = 'higher'
    else if (self.interval.high < rest.interval.low && -gap >= MIN_EFFECT) versusRest = 'lower'
    else versusRest = 'within'
  }

  return { group: role ? 'role' : 'all', roleAvailable: Boolean(self.role), role, rows, ranked: enough.length, winRatePosition, pickRatePosition, rest, versusRest }
}

type Translate = (key: string, values?: Record<string, string | number>) => string

/**
 * The sentence under the peer list. `t` reads analyze.compare; `group` is the worded group ("Marksman
 * heroes" / "all heroes"); positions and counts stay numbers (the catalog formats the ordinals).
 * `separator` joins the two sentences (none after a CJK full stop).
 */
export function comparisonText(
  c: PeerComparison,
  v: { hero: string; group: string; selfWinRate: number | null },
  t: Translate,
  f: { percent: (x: number) => string; delta: (x: number) => string },
  separator = ' ',
): string {
  if (c.winRatePosition === null || v.selfWinRate === null) return t('lowSample', { hero: v.hero })
  const versus =
    c.rest && (c.versusRest === 'higher' || c.versusRest === 'lower')
      ? t(c.versusRest, { group: v.group, rate: f.percent(c.rest.winRate), delta: f.delta(v.selfWinRate - c.rest.winRate) })
      : c.rest && c.versusRest === 'within'
        ? t('within', { group: v.group, rate: f.percent(c.rest.winRate) })
        : ''
  return `${t('standing', { win: c.winRatePosition, pick: c.pickRatePosition ?? 0, count: c.ranked, group: v.group })}${separator}${versus}`
}

/**
 * Which days the trend charts cover. `t` reads analyze.trends; `window` and `rank` are the scope labels,
 * `dates` the formatted range. Days the source has no row for are stated, never filled in.
 */
export function trendRangeText(range: TrendRange, v: { window: string; rank: string; dates: string }, t: Translate, separator = ' '): string {
  const text = t('range', { window: v.window, dates: v.dates, days: range.requestedDays, rank: v.rank })
  return range.missingDays > 0 ? `${text}${separator}${t('missing', { missing: range.missingDays, shown: range.points.length })}` : text
}

/** "1st", "2nd", "3rd", "11th", "22nd". */
export function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

/** Heroes offered in the picker: the role filter applied, alphabetical. */
export function pickerHeroes<T extends { name: string; role: string | null }>(heroes: T[], role: 'all' | string): T[] {
  return heroes.filter((h) => role === 'all' || h.role === role).sort((a, b) => a.name.localeCompare(b.name))
}

// ── Trend range ──────────────────────────────────────────────────────

const DAY = 86_400

export type TrendRange = {
  /** Daily points inside the selected window, oldest first. */
  points: DayPoint[]
  /** Requested window, UTC day starts (unix seconds). */
  from: number
  to: number
  /** Days the window spans, and how many of them have no daily point (the source returned no row). */
  requestedDays: number
  missingDays: number
}

/**
 * The trend for the selected window, cut from the shared 60-day daily series. Nothing is filled in:
 * days the source has no row for are counted as missing so the UI can say so.
 */
export function trendRange(series: DayPoint[], windowStart: number, today: number): TrendRange {
  const points = series.filter((p) => p.day >= windowStart && p.day <= today)
  const requestedDays = Math.floor((today - windowStart) / DAY) + 1
  return { points, from: windowStart, to: today, requestedDays, missingDays: Math.max(0, requestedDays - points.length) }
}
