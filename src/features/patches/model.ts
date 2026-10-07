import { MIN_EFFECT } from '@/lib/analytics/insights'
import { pickRates } from '@/lib/analytics/pickRate'
import { sampleTier, type SampleTier } from '@/lib/analytics/sampleTier'
import { trendBetween } from '@/lib/analytics/trend'
import { wilsonInterval, type Interval } from '@/lib/analytics/wilson'
import { patchDateFromTitle } from '@/lib/deadlock/patchDate'
import type { Direction } from './direction'
import type { EntityChange } from './diff'

/*
 * Patch pages (pure). Statistics around a patch describe timing only: other things change in the same
 * days (player mix, other heroes, events), so wording never states a cause.
 */

const DAY = 86_400

// ── Patch list ───────────────────────────────────────────────────────

export type FeedEntry = { source: 'forum' | 'steam'; title: string; pub_date: string; link?: string | null; content?: string | null }

export type PatchSummary = {
  /** YYYY-MM-DD (UTC patch day). */
  id: string
  /** Unix seconds, 00:00 UTC of the patch day. */
  day: number
  title: string
  /** Official notes HTML (Steam "Minor Update" posts); null when the feed only links to them. */
  notesHtml: string | null
  links: Array<{ label: string; href: string }>
}

const MINOR_UPDATE = /minor update\s*-\s*(\d{2}-\d{2}-\d{4})/i
const isoDay = (day: number) => new Date(day * 1000).toISOString().slice(0, 10)
const toDay = (ms: number) => Math.floor(ms / 1000 / DAY) * DAY

/**
 * One entry per patch day, newest first. Patch days come from forum changelog titles and Steam
 * "Minor Update - MM-DD-YYYY" titles (title dates; forum pub_date is unreliable). A named Steam post
 * (e.g. a major update) published on a patch day gives that patch its name. Other news posts are skipped.
 */
export function patchesFromFeed(feed: FeedEntry[]): PatchSummary[] {
  const byDay = new Map<number, PatchSummary>()
  const get = (day: number) => {
    let p = byDay.get(day)
    if (!p) byDay.set(day, (p = { id: isoDay(day), day, title: `${isoDay(day)} update`, notesHtml: null, links: [] }))
    return p
  }
  for (const e of feed) {
    const minor = e.source === 'steam' ? MINOR_UPDATE.exec(e.title) : null
    const titled = e.source === 'forum' || minor ? patchDateFromTitle(minor ? minor[1] : e.title) : null
    if (titled === null) continue
    const p = get(titled / 1000)
    if (minor && e.content) p.notesHtml = e.content
    if (e.link) p.links.push({ label: e.source === 'forum' ? 'Official changelog (forum)' : 'Steam news', href: e.link })
  }
  for (const e of feed) {
    if (e.source !== 'steam' || MINOR_UPDATE.test(e.title)) continue
    const day = toDay(Date.parse(e.pub_date))
    const p = byDay.get(day)
    if (!p) continue
    p.title = e.title.trim()
    if (e.link) p.links.push({ label: 'Steam news', href: e.link })
  }
  return [...byDay.values()].sort((a, b) => b.day - a.day)
}

// ── Windows ──────────────────────────────────────────────────────────

export type Window = { from: number; to: number; days: number }

/**
 * Same windows as Hero Detail's patch impact: the 7 days before the patch day vs up to 7 days from it.
 * `before` starts no earlier than the previous patch; `after` ends at the next patch or today (inclusive).
 * `to` is exclusive. `patches` is newest first.
 */
export function patchWindows(patches: PatchSummary[], index: number, today: number): { before: Window; after: Window } {
  const p = patches[index]
  const next = index > 0 ? patches[index - 1].day : Infinity
  const prev = patches[index + 1]?.day ?? -Infinity
  const beforeFrom = Math.max(p.day - 7 * DAY, prev)
  const afterTo = Math.min(p.day + 7 * DAY, next, today + DAY)
  return {
    before: { from: beforeFrom, to: p.day, days: Math.max(0, (p.day - beforeFrom) / DAY) },
    after: { from: p.day, to: afterTo, days: Math.max(0, (afterTo - p.day) / DAY) },
  }
}

/** A patch's own period, for comparing patches: from its day to the next patch (at most 7 days). */
export function patchPeriod(patches: PatchSummary[], index: number, today: number): Window {
  return patchWindows(patches, index, today).after
}

// ── Before / after statistics ────────────────────────────────────────

export type Stat = { wins: number; matches: number; winRate: number; interval: Interval; sample: SampleTier }
const stat = (wins: number, matches: number): Stat => ({ wins, matches, winRate: wins / matches, interval: wilsonInterval(wins, matches), sample: sampleTier(matches) })

export type DayRow = { id: number; day: number; wins: number; matches: number }

/** Sums rows per id inside [from, to). */
export function sumWindow(rows: DayRow[], w: Window): Map<number, { wins: number; matches: number }> {
  const out = new Map<number, { wins: number; matches: number }>()
  for (const r of rows) {
    if (r.day < w.from || r.day >= w.to) continue
    const t = out.get(r.id) ?? { wins: 0, matches: 0 }
    t.wins += r.wins
    t.matches += r.matches
    out.set(r.id, t)
  }
  return out
}

export type Verdict = 'higher' | 'lower' | 'no clear change' | 'not enough data'

export const CLEAR_RULE = 'Both periods have 200+ matches, their 95% intervals don’t overlap, and the win rate moved at least 1 percentage point.'

/** Same rule as the Recent shift insight: separated 95% intervals and a gap ≥ MIN_EFFECT. */
export function verdict(before: Stat | null, after: Stat | null): Verdict {
  if (!before || !after) return 'not enough data'
  const t = trendBetween(after, before)
  if (!t) return 'not enough data'
  if (t.direction === 'stable' || Math.abs(t.delta) < MIN_EFFECT) return 'no clear change'
  return t.direction === 'rising' ? 'higher' : 'lower'
}

export type Movement = {
  id: number
  before: Stat | null
  after: Stat | null
  /** After − before (ratio), null without both sides. */
  winDelta: number | null
  /** Pick rate (heroes) or buy rate (items) per period. */
  rateBefore: number | null
  rateAfter: number | null
  verdict: Verdict
}

/**
 * Win rate and pick/buy rate per id in two periods. `rates` are each period's pick or buy rates
 * (heroPickRates / itemBuyRates).
 */
export function movements(
  ids: number[],
  a: Map<number, { wins: number; matches: number }>,
  b: Map<number, { wins: number; matches: number }>,
  rates: { a: Map<number, number>; b: Map<number, number> },
): Movement[] {
  const ra = rates.a
  const rb = rates.b
  return ids.map((id) => {
    const x = a.get(id)
    const y = b.get(id)
    const before = x && x.matches > 0 ? stat(x.wins, x.matches) : null
    const after = y && y.matches > 0 ? stat(y.wins, y.matches) : null
    return {
      id,
      before,
      after,
      winDelta: before && after ? after.winRate - before.winRate : null,
      rateBefore: ra.get(id) ?? null,
      rateAfter: rb.get(id) ?? null,
      verdict: verdict(before, after),
    }
  })
}

/** Hero pick rate per period (hero matches ÷ (Σ ÷ 12)), as on Meta. */
export const heroPickRates = (period: Map<number, { matches: number }>) => pickRates(new Map([...period].map(([id, t]) => [id, t.matches])))

/** Item buy rate per period: item matches ÷ all player-matches (Σ hero matches) in the same period. */
export function itemBuyRates(items: Map<number, { matches: number }>, heroes: Map<number, { matches: number }>): Map<number, number> {
  let playerMatches = 0
  for (const t of heroes.values()) playerMatches += t.matches
  return new Map([...items].map(([id, t]) => [id, playerMatches > 0 ? t.matches / playerMatches : 0]))
}

/** Clear movers only (verdict higher / lower), largest first. */
export function mostImpacted<T extends Movement>(rows: T[], limit = 3): { up: T[]; down: T[] } {
  const clear = rows.filter((r) => r.winDelta !== null && (r.verdict === 'higher' || r.verdict === 'lower'))
  return {
    up: clear.filter((r) => r.verdict === 'higher').sort((a, b) => b.winDelta! - a.winDelta!).slice(0, limit),
    down: clear.filter((r) => r.verdict === 'lower').sort((a, b) => a.winDelta! - b.winDelta!).slice(0, limit),
  }
}

// ── Changes, grouped for display ─────────────────────────────────────

export type HeroChanges = { heroId: number; name: string; status: 'changed' | 'new' | 'removed'; direction: Direction | 'mixed'; parts: EntityChange[] }

/** Hero base stats, gun and abilities grouped per hero; shop items separately. */
export function groupChanges(changes: EntityChange[], heroNames: Record<number, string>): { heroes: HeroChanges[]; items: EntityChange[] } {
  const heroes = new Map<number, HeroChanges>()
  for (const c of changes) {
    if (c.kind === 'item' || c.heroId === null) continue
    const h = heroes.get(c.heroId) ?? { heroId: c.heroId, name: heroNames[c.heroId] ?? `Hero ${c.heroId}`, status: 'changed', direction: 'changed', parts: [] }
    if (c.kind === 'hero' && c.status !== 'changed') h.status = c.status
    else h.parts.push(c)
    heroes.set(c.heroId, h)
  }
  const order: Record<EntityChange['kind'], number> = { hero: 0, weapon: 1, ability: 2, item: 3 }
  for (const h of heroes.values()) {
    h.parts.sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name))
    h.direction = combine(h.parts.map((p) => p.direction))
  }
  return {
    heroes: [...heroes.values()].sort((a, b) => a.name.localeCompare(b.name)),
    items: changes.filter((c) => c.kind === 'item').sort((a, b) => a.name.localeCompare(b.name)),
  }
}

function combine(list: Array<Direction | 'mixed'>): Direction | 'mixed' {
  if (list.includes('mixed')) return 'mixed'
  const set = new Set(list.filter((d) => d !== 'changed'))
  return set.size === 0 ? 'changed' : set.size > 1 ? 'mixed' : [...set][0]
}

// ── Counts and markers ───────────────────────────────────────────────

export type ChangeCounts = { heroes: number; abilities: number; items: number; buffs: number; nerfs: number; changed: number }
export type Mark = Direction | 'mixed' | 'new' | 'removed'

/** Counts from the game-data diff (value changes; new / removed entries aren't value changes). */
export function diffCounts(heroes: HeroChanges[], items: EntityChange[]): ChangeCounts {
  const values = [...heroes.flatMap((h) => h.parts), ...items].flatMap((c) => c.changes)
  return {
    heroes: heroes.length,
    abilities: heroes.reduce((n, h) => n + h.parts.filter((p) => p.kind === 'ability').length, 0),
    items: items.length,
    buffs: values.filter((v) => v.direction === 'buff').length,
    nerfs: values.filter((v) => v.direction === 'nerf').length,
    changed: values.filter((v) => v.direction === 'changed').length,
  }
}

/** Counts from the official notes, for patches without a game-data diff. */
export function noteCounts(lines: Array<{ kind: string; subject: string | null; component: string | null; property: string | null; direction: Direction }>): ChangeCounts {
  const distinct = (list: Array<string | null>) => new Set(list.filter(Boolean)).size
  const valued = lines.filter((l) => l.property)
  return {
    heroes: distinct(lines.filter((l) => l.kind === 'hero').map((l) => l.subject)),
    abilities: distinct(lines.filter((l) => l.kind === 'hero' && l.component && l.component.toLowerCase() !== 'gun').map((l) => `${l.subject}|${l.component}`)),
    items: distinct(lines.filter((l) => l.kind === 'item').map((l) => l.subject)),
    buffs: valued.filter((l) => l.direction === 'buff').length,
    nerfs: valued.filter((l) => l.direction === 'nerf').length,
    changed: valued.filter((l) => l.direction === 'changed').length,
  }
}

/** Per hero / item id: what the patch did to it, for "changed in this patch" markers next to statistics. */
export function changeMarks(heroes: HeroChanges[], items: EntityChange[]): { heroes: Map<number, Mark>; items: Map<number, Mark> } {
  return {
    heroes: new Map(heroes.map((h) => [h.heroId, h.status === 'changed' ? h.direction : h.status])),
    items: new Map(items.map((i) => [i.id, i.status === 'changed' ? i.direction : i.status])),
  }
}
