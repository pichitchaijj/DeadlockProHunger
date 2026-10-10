/*
 * features/patches/diff.ts before label references (patch-diff-v2), verbatim: the invariance oracle for
 * tests/unit/patches-text.test.ts. Test-only: never import it from src/.
 */
import type { RawAssetHero, RawAssetItem } from '@/lib/deadlock/patchEndpoints'
import { direction, overallDirection, parseValue, type Direction } from '@/features/patches/direction'

/*
 * Game-data diff between two builds (pure). Values come from the game files as the API parses them per
 * client version, so a before → after here is what the game actually shipped, not a reading of the notes.
 * Only player-facing things are compared: selectable heroes (base stats), their abilities and gun, and
 * shop items. Internal/unnamed entries (class-name-like names) are skipped.
 */

export type EntityKind = 'hero' | 'ability' | 'weapon' | 'item'

type Prop = { label: string; n: number | null; text: string; labeled: boolean }

export type Entity = { key: string; kind: EntityKind; id: number; name: string; heroId: number | null; slot: string | null; props: Record<string, Prop> }

export type PropChange = { property: string; before: string; after: string; direction: Direction }

export type EntityChange = Omit<Entity, 'props'> & { status: 'changed' | 'new' | 'removed'; changes: PropChange[]; direction: Direction | 'mixed' }

/** Game units per meter (verified: falloff 787 units = 20 m in the patch notes). */
const UNITS_PER_METER = 39.37

/** Gun stats shown from weapon_info: [key, label, unit, divisor]. */
const WEAPON_FIELDS: Array<[string, string, string, number]> = [
  ['bullet_damage', 'Bullet damage', '', 1],
  ['bullets', 'Bullets per shot', '', 1],
  ['cycle_time', 'Fire interval', 's', 1],
  ['clip_size', 'Magazine size', '', 1],
  ['reload_duration', 'Reload time', 's', 1],
  ['damage_falloff_start_range', 'Falloff start range', 'm', UNITS_PER_METER],
  ['damage_falloff_end_range', 'Falloff end range', 'm', UNITS_PER_METER],
  ['crit_bonus_start', 'Headshot multiplier', '×', 1],
]

const CLASS_LIKE = /^[a-z0-9_]+$/
const round = (n: number) => Number(n.toFixed(3))
const humanize = (key: string) =>
  key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^\w/, (c) => c.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim()

function prop(label: string, raw: string | number, labeled: boolean, fallbackUnit = '', divisor = 1): Prop | null {
  const { n, unit } = parseValue(raw)
  if (n === null) return typeof raw === 'string' && raw.trim() !== '' ? { label, n: null, text: raw.trim(), labeled: false } : null
  const value = round(n / divisor)
  return { label, n: value, text: `${value}${unitText(unit || fallbackUnit)}`, labeled }
}

/** Short units attach to the number (12s, 6.5m, 15%, 1.65×); words get a space (800 souls). */
const unitText = (u: string) => (!u ? '' : /^(%|m|s|×|m\/s)$/.test(u) ? u : ` ${u}`)

/** Player-facing entities in one build, keyed by kind + id. */
export function snapshotEntities(snapshot: { items: RawAssetItem[]; heroes: RawAssetHero[] }): Map<string, Entity> {
  const out = new Map<string, Entity>()
  const owner = new Map<string, { heroId: number; kind: 'ability' | 'weapon' }>()

  for (const h of snapshot.heroes) {
    if (!h.player_selectable || h.disabled) continue
    const props: Record<string, Prop> = {}
    for (const [key, stat] of Object.entries(h.starting_stats ?? {})) {
      if (typeof stat?.value !== 'number') continue
      const p = prop(humanize(key), stat.value, true)
      if (p) props[key] = p
    }
    out.set(`hero:${h.id}`, { key: `hero:${h.id}`, kind: 'hero', id: h.id, name: h.name, heroId: h.id, slot: null, props })
    for (const [slot, className] of Object.entries(h.items ?? {})) {
      if (/^signature\d$/.test(slot)) owner.set(className, { heroId: h.id, kind: 'ability' })
      else if (slot === 'weapon_primary') owner.set(className, { heroId: h.id, kind: 'weapon' })
    }
  }

  for (const item of snapshot.items) {
    const props: Record<string, Prop> = {}
    if (item.type === 'upgrade') {
      if (!item.shopable || !item.name || CLASS_LIKE.test(item.name)) continue
      if (typeof item.cost === 'number') props.cost = prop('Cost', item.cost, true, 'souls')!
      addProperties(item, props)
      out.set(`item:${item.id}`, { key: `item:${item.id}`, kind: 'item', id: item.id, name: item.name, heroId: null, slot: item.item_slot_type ?? null, props })
      continue
    }
    const own = owner.get(item.class_name)
    if (!own) continue
    if (own.kind === 'weapon') {
      for (const [key, label, unit, divisor] of WEAPON_FIELDS) {
        const v = item.weapon_info?.[key]
        if (typeof v !== 'number') continue
        const p = prop(label, v, true, unit, divisor)
        if (p) props[key] = p
      }
      out.set(`item:${item.id}`, { key: `item:${item.id}`, kind: 'weapon', id: item.id, name: 'Gun', heroId: own.heroId, slot: null, props })
    } else {
      if (!item.name || CLASS_LIKE.test(item.name)) continue
      addProperties(item, props)
      out.set(`item:${item.id}`, { key: `item:${item.id}`, kind: 'ability', id: item.id, name: item.name, heroId: own.heroId, slot: null, props })
    }
  }
  return out
}

function addProperties(item: RawAssetItem, props: Record<string, Prop>) {
  for (const [key, p] of Object.entries(item.properties ?? {})) {
    if (!p || p.value === null || p.value === undefined) continue
    const made = prop(p.label?.trim() || humanize(key), p.value, Boolean(p.label?.trim()), p.postfix ?? '')
    if (made) props[key] = made
  }
}

/**
 * Changes between two builds. New / removed are reported for heroes, shop items and abilities of heroes
 * that existed before (a new hero's own abilities are part of "new hero").
 */
export function diffSnapshots(before: Map<string, Entity>, after: Map<string, Entity>): EntityChange[] {
  const changes: EntityChange[] = []
  const newHeroes = new Set([...after.values()].filter((e) => e.kind === 'hero' && !before.has(e.key)).map((e) => e.id))

  for (const [key, a] of after) {
    const { props: _props, ...rest } = a
    const b = before.get(key)
    if (!b) {
      if (a.kind === 'hero' || a.kind === 'item' || (a.heroId !== null && !newHeroes.has(a.heroId))) changes.push({ ...rest, status: 'new', changes: [], direction: 'changed' })
      continue
    }
    const list: PropChange[] = []
    for (const [k, pa] of Object.entries(a.props)) {
      const pb = b.props[k]
      if (!pb || pb.text === pa.text) continue
      // Same number, different display unit (e.g. "2 %/sec" → "2 % DPS"): not a value change.
      if (pb.n !== null && pa.n !== null && pb.n === pa.n) continue
      list.push({ property: pa.label, before: pb.text, after: pa.text, direction: pa.labeled && pb.n !== null ? direction(pa.label, pb.n, pa.n) : 'changed' })
    }
    if (list.length > 0) changes.push({ ...rest, status: 'changed', changes: list, direction: overallDirection(list.map((c) => c.direction)) })
  }
  for (const [key, b] of before) {
    if (after.has(key) || (b.kind !== 'hero' && b.kind !== 'item')) continue
    const { props: _props, ...rest } = b
    changes.push({ ...rest, status: 'removed', changes: [], direction: 'changed' })
  }
  return changes
}

/** An identical before → after on this many entries is a broad change (a global rule or a data-format change). */
export const BROAD_MIN = 10

export type BroadChange = PropChange & { count: number }

/**
 * Moves identical changes (same property, before and after) that appear on BROAD_MIN+ entries out of the
 * per-entity lists into one line each, so a global change doesn't bury the specific ones. Entities left
 * without changes are dropped.
 */
export function splitBroadChanges(changes: EntityChange[]): { changes: EntityChange[]; broad: BroadChange[] } {
  const key = (c: PropChange) => `${c.property}|${c.before}|${c.after}`
  const counts = new Map<string, { change: PropChange; count: number }>()
  for (const e of changes) for (const c of e.changes) counts.set(key(c), { change: c, count: (counts.get(key(c))?.count ?? 0) + 1 })
  const broadKeys = new Set([...counts].filter(([, v]) => v.count >= BROAD_MIN).map(([k]) => k))
  const kept = changes.flatMap((e) => {
    if (e.status !== 'changed') return [e]
    const list = e.changes.filter((c) => !broadKeys.has(key(c)))
    if (list.length === 0) return []
    return [list.length === e.changes.length ? e : { ...e, changes: list, direction: overallDirection(list.map((c) => c.direction)) }]
  })
  const broad = [...broadKeys].map((k) => ({ ...counts.get(k)!.change, count: counts.get(k)!.count })).sort((a, b) => b.count - a.count)
  return { changes: kept, broad }
}
