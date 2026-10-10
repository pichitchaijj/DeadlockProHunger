import { readFileSync } from 'node:fs'
import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'
import type { Locale } from '@/i18n/config'
import en from '@/i18n/messages/en'
import ja from '@/i18n/messages/ja'
import ko from '@/i18n/messages/ko'
import th from '@/i18n/messages/th'
import zhCN from '@/i18n/messages/zh-CN'
import { direction } from '@/features/patches/direction'
import { diffSnapshots, snapshotEntities, splitBroadChanges, type EntityChange, type PropChange } from '@/features/patches/diff'
import { changeMarks, diffCounts, groupChanges, patchesFromFeed, patchPeriod, patchWindows, type Mark, type Verdict } from '@/features/patches/model'
import { markLabel, patchDate, patchTitle, propertyText, valueText, verdictLabel, windowRange, type PatchTranslate } from '@/features/patches/text'
import { formatInteger } from '@/lib/format'
import * as v1 from './legacy/patchTextV1'
import * as diffV1 from './legacy/patchDiffV1'

/*
 * Patch wording: the catalog `patch` plus the pure helpers in features/patches/text.ts. The English oracle is
 * the pre-localization wording (./legacy/patchTextV1.ts) and diff (./legacy/patchDiffV1.ts), kept verbatim:
 * English must reproduce them exactly, and every locale must keep the same data.
 */

const LOCALES: Array<[Locale, typeof en]> = [['en', en], ['th', th], ['ja', ja], ['ko', ko], ['zh-CN', zhCN]]
const translator = (locale: Locale, messages: typeof en) => {
  const t = createTranslator({ locale, messages, namespace: 'patch' })
  const tr: PatchTranslate = (key, values) => t(key as 'untitled', values)
  return { t, tr }
}
const { t: T, tr: EN } = translator('en', en)

const DAY = 86_400
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 1000

// ── Fixture: two builds with every kind of change ──────────────────

type Stats = Record<string, number>
const hero = (id: number, name: string, stats: Stats) => ({
  id,
  class_name: `hero_${id}`,
  name,
  player_selectable: true,
  disabled: false,
  items: { signature1: `ability_${id}`, weapon_primary: `weapon_${id}` },
  starting_stats: Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, { value: v }])),
})
const ability = (heroId: number, props: Record<string, { value: string | number; label?: string; postfix?: string }>) => ({
  id: heroId * 10,
  class_name: `ability_${heroId}`,
  name: `Ability ${heroId}`,
  type: 'ability',
  properties: props,
})
const weapon = (heroId: number, info: Stats) => ({ id: heroId * 10 + 1, class_name: `weapon_${heroId}`, name: 'Some Gun', type: 'weapon', weapon_info: info })
const shopItem = (id: number, cost: number, props: Record<string, { value: string | number; label?: string; postfix?: string }> = {}) => ({
  id,
  class_name: `upgrade_${id}`,
  name: `Shop Item ${id}`,
  type: 'upgrade',
  shopable: true,
  cost,
  item_slot_type: 'weapon',
  properties: props,
})

function build(after: boolean) {
  const heroes = [hero(1, 'Rat King', { max_health: after ? 700 : 730, move_speed: after ? 7.5 : 7, stamina: 3 }), after ? hero(2, 'New Hero', { max_health: 600 }) : hero(3, 'Old Hero', { max_health: 500 })]
  const items = [
    ability(1, {
      AbilityCooldown: { value: after ? '24' : '28', label: 'Cooldown', postfix: 's' },
      Damage: { value: after ? 110 : 100, label: 'Damage' },
      Bleed: { value: '2', label: 'Bleed Damage', postfix: after ? '% DPS' : '%/sec' },
      HiddenRadius: { value: after ? '4' : '3' },
    }),
    weapon(1, { bullet_damage: after ? 16.5 : 17.76, cycle_time: after ? 0.25 : 0.2, clip_size: after ? 22 : 20, damage_falloff_start_range: after ? 900 : 787, crit_bonus_start: 1.65 }),
    // Twelve items share the same cost change: a broad change keyed with the cost unit.
    ...Array.from({ length: 12 }, (_, i) => shopItem(100 + i, after ? 2800 : 3000, i === 0 ? { BonusHealth: { value: after ? 150 : 125, label: 'Bonus Health' } } : {})),
    after ? shopItem(113, 1250) : shopItem(112, 800),
  ]
  return { heroes, items }
}

const newDiff = splitBroadChanges(diffSnapshots(snapshotEntities(build(false) as never), snapshotEntities(build(true) as never)))
const oldDiff = diffV1.splitBroadChanges(diffV1.diffSnapshots(diffV1.snapshotEntities(build(false) as never), diffV1.snapshotEntities(build(true) as never)))

/** A new-format change as the old English diff stored it. */
const english = (c: PropChange) => ({ property: propertyText(c.property, EN), before: valueText(c.before, c.unit, EN), after: valueText(c.after, c.unit, EN), direction: c.direction })
const englishEntity = ({ changes, ...e }: EntityChange) => ({ ...e, name: e.kind === 'weapon' ? T('changes.gun') : e.name, changes: changes.map(english) })

// ── English drift ──────────────────────────────────────────────────

describe('English matches the original wording', () => {
  it('marks and verdicts', () => {
    for (const mark of Object.keys(v1.MARKS) as Mark[]) expect(markLabel(mark, EN)).toBe(v1.MARKS[mark].label)
    for (const verdict of Object.keys(v1.VERDICTS) as Verdict[]) expect(verdictLabel(verdict, EN)).toBe(v1.VERDICTS[verdict].label)
  })

  it('rules, as stated alone and inside sentences', () => {
    expect(T('rules.clear')).toBe(v1.CLEAR_RULE)
    expect(T('rules.direction')).toBe(v1.DIRECTION_RULE)
    expect(T('impact.mostImpactedNote', { rule: T('rules.clear') })).toBe(v1.mostImpactedNote)
    expect(T.markup('detail.how.direction', { rule: T('rules.direction'), b: (chunks) => chunks })).toBe(v1.howDirection)
  })

  it('links, the unnamed patch and hero, Gun, Cost, souls and the gun-stat labels', () => {
    expect(T('links.forum')).toBe(v1.linkLabel('forum'))
    expect(T('links.steam')).toBe(v1.linkLabel('steam'))
    expect(patchTitle({ id: '2026-10-05', title: null }, EN)).toBe(v1.untitled('2026-10-05'))
    expect(patchTitle({ id: '2026-10-05', title: 'City Never Sleeps' }, EN)).toBe('City Never Sleeps')
    expect(T('changes.unnamedHero', { id: 12 })).toBe(v1.unnamedHero(12))
    expect(T('changes.gun')).toBe(v1.GUN)
    expect(propertyText({ site: 'cost' }, EN)).toBe(v1.COST_LABEL)
    expect(valueText('3000', 'souls', EN)).toBe(v1.costText('3000'))
    for (const [key, label] of v1.WEAPON_FIELDS) expect(propertyText({ site: key as 'bullets' }, EN)).toBe(label)
  })

  it('dates and windows', () => {
    const feed = ['10-05-2026', '09-29-2026', '09-16-2026'].map((title) => ({ source: 'forum' as const, title, pub_date: '2026-10-06T00:00:00Z' }))
    const patches = patchesFromFeed(feed)
    for (const today of [day('2026-10-06'), day('2026-10-12')]) {
      for (let i = 0; i < patches.length; i++) {
        const { before, after } = patchWindows(patches, i, today)
        if (before.days === 0 || after.days === 0) continue
        const old = v1.impactLabels(before, after)
        expect(T('impact.before', { range: windowRange(before, 'short', 'en', EN) })).toBe(old.a)
        expect(T('impact.after', { range: windowRange(after, 'short', 'en', EN) })).toBe(old.b)
        expect(T('impact.versus', old)).toBe(v1.versus(old.a, old.b))
      }
      const [pa, pb] = [patchPeriod(patches, 2, today), patchPeriod(patches, 0, today)]
      const old = v1.compareLabels(patches[2].id, pa, patches[0].id, pb)
      const labels = { a: T('impact.period', { id: patches[2].id, range: windowRange(pa, 'day', 'en', EN) }), b: T('impact.period', { id: patches[0].id, range: windowRange(pb, 'day', 'en', EN) }) }
      expect(labels).toEqual(old)
      expect(T('compare.heroesDescription', labels)).toBe(v1.heroesDescription(old.a, old.b))
      expect(T('compare.heroCaption', labels)).toBe(v1.compareCaption('hero', old.a, old.b))
      expect(T('compare.itemCaption', labels)).toBe(v1.compareCaption('item', old.a, old.b))
      expect(T('impact.footnote', labels)).toBe(v1.impactFootnote(old.a, old.b))
    }
    for (const p of patches) {
      expect(patchDate(p.day, 'day', 'en')).toBe(v1.listDate(p.day))
      expect(T('list.latest', { date: patchDate(p.day, 'day', 'en') })).toBe(v1.latestEyebrow(p.day))
      expect(T('detail.eyebrow', { date: patchDate(p.day, 'long', 'en') })).toBe(v1.detailEyebrow(p.day))
      const meta = v1.detailMetadata('City Never Sleeps', p.day)
      expect(T('meta.detailTitle', { title: 'City Never Sleeps' })).toBe(meta.title)
      expect(T('meta.detailDescription', { date: patchDate(p.day, 'long', 'en') })).toBe(meta.description)
    }
    const from = { version: 6102, builtAt: Date.UTC(2026, 9, 4, 23, 59) / 1000 }
    const to = { version: 6107, builtAt: Date.UTC(2026, 9, 5, 7, 3) / 1000 }
    expect(T('changes.build', { from: from.version, fromTime: patchDate(from.builtAt, 'build', 'en'), to: to.version, toTime: patchDate(to.builtAt, 'build', 'en') })).toBe(v1.buildLine(from, to))
    expect(T('compare.dataDescription', { from: 6102, to: 6107 })).toBe(v1.dataDescription(6102, 6107))
  })

  it('count and list templates (plural forms match the original for every count other than 1)', () => {
    for (const n of [0, 2, 3, 12, 250]) {
      expect(T('list.counts', { heroes: n, abilities: n + 2, items: n + 4 })).toBe(v1.counts({ heroes: n, abilities: n + 2, items: n + 4 }))
      expect(T('changes.showNotes', { count: n })).toBe(v1.showNotes(n))
      expect(T('list.footnote', { count: n })).toBe(v1.footnote(n))
      expect(T('impact.table.matchesAfterCount', { count: n })).toBe(v1.matchesAfter(formatInteger(n)))
      expect(T('changes.broad.entries', { count: n })).toBe(v1.entries(n))
      expect(T('changes.broad.summary', { count: n })).toBe(v1.broadSummary(n))
    }
    // Counts of 1,000+ are grouped in the locale's style (the original printed "1234").
    expect(T('impact.table.matchesAfterCount', { count: 1234 })).toBe(v1.matchesAfter(formatInteger(1234)))
    expect(T('changes.broad.entries', { count: 1234 })).toBe('on 1,234 entries')
    // The early-signal notices already said "1 day": every count matches.
    for (const n of [0, 1, 2]) {
      expect(T('impact.early', { count: n })).toBe(v1.early(n))
      expect(T('compare.early', { count: n })).toBe(v1.compareEarly(n))
    }
    // Intentional: "1 hero", "1 line", "1 entry", "1 match after" instead of "1 heroes", "1 lines", ….
    expect(T('list.counts', { heroes: 1, abilities: 1, items: 1 })).toBe('1 hero · 1 ability · 1 item (official notes)')
    expect(T('changes.summary.values', { source: 'game' })).toBe(v1.valueChanges('from game data'))
    expect(T('changes.summary.values', { source: 'notes' })).toBe(v1.valueChanges('from the official notes'))
    expect(T('changes.noHeroes')).toBe(v1.noHeroes())
    expect(T('changes.noHeroesFor', { hero: 'Haze' })).toBe(v1.noHeroes('Haze'))
    expect(T('changes.noItems')).toBe(v1.noItems())
    expect(T('changes.noItemsFor', { item: 'Mystic Burst' })).toBe(v1.noItems('Mystic Burst'))
    expect(T('option', { id: '2026-10-05', title: 'City Never Sleeps' })).toBe(v1.option('2026-10-05', 'City Never Sleeps'))
    expect(T('changes.itemTier', { tier: 3 })).toBe(v1.itemTier(3))
  })
})

// ── Data invariance ────────────────────────────────────────────────

describe('the diff keeps its data', () => {
  it('reproduces the original English diff exactly (entities, values, directions, broad changes, order)', () => {
    expect(newDiff.changes.map(englishEntity)).toEqual(oldDiff.changes)
    expect(newDiff.broad.map(({ count, ...c }) => ({ ...english(c), count }))).toEqual(oldDiff.broad)
    // The fixture covers every label kind, a site unit inside a broad change, and the gun.
    expect(oldDiff.broad.some((b) => b.property === 'Cost' && b.after === '2800 souls')).toBe(true)
    expect(newDiff.changes.some((c) => c.kind === 'weapon')).toBe(true)
  })

  it('stores references, never this site’s English, in the cached diff', () => {
    const cached = JSON.stringify(newDiff)
    for (const english of ['Bullet damage', 'Fire interval', 'Magazine size', 'Falloff start range', 'Headshot multiplier', '"Gun"', '"Cost"', ' souls', 'Max health', 'Move speed', 'Hidden radius']) expect(cached).not.toContain(english)
    expect(cached).toContain('"unit":"souls"') // a unit code, worded at render
    expect(cached).toContain('{"site":"cost"}')
    expect(cached).toContain('{"stat":"max_health"}')
    expect(cached).toContain('{"game":"Cooldown"}')
  })

  it('groups, counts and marks the same way', () => {
    const fresh = groupChanges(newDiff.changes, { 1: 'Rat King', 2: 'New Hero', 3: 'Old Hero' })
    const legacy = groupChanges(oldDiff.changes as never, { 1: 'Rat King', 2: 'New Hero', 3: 'Old Hero' })
    expect(fresh.heroes.map((h) => [h.heroId, h.name, h.status, h.direction, h.parts.map((p) => p.key)])).toEqual(legacy.heroes.map((h) => [h.heroId, h.name, h.status, h.direction, h.parts.map((p) => p.key)]))
    expect(fresh.items.map((i) => i.key)).toEqual(legacy.items.map((i) => i.key))
    expect(diffCounts(fresh.heroes, fresh.items)).toEqual(diffCounts(legacy.heroes, legacy.items))
    expect([...changeMarks(fresh.heroes, fresh.items).heroes]).toEqual([...changeMarks(legacy.heroes, legacy.items).heroes])
    expect([...changeMarks(fresh.heroes, fresh.items).items]).toEqual([...changeMarks(legacy.heroes, legacy.items).items])
  })

  it('reads buff / nerf from the English source label, never a translation', () => {
    const gun = newDiff.changes.find((c) => c.kind === 'weapon')!
    const fireInterval = gun.changes.find((c) => 'site' in c.property && c.property.site === 'cycle_time')!
    // "Fire interval" is lower-is-better: 0.2s → 0.25s is a nerf. A translated label would not match the rule.
    expect(fireInterval.direction).toBe('nerf')
    expect(fireInterval.direction).toBe(direction('Fire interval', 0.2, 0.25))
    for (const [locale, messages] of LOCALES.slice(1)) {
      const { tr } = translator(locale, messages)
      expect(direction(propertyText(fireInterval.property, tr), 0.2, 0.25)).toBe('changed')
    }
  })
})

// ── Every locale ───────────────────────────────────────────────────

describe('every locale', () => {
  const keys = (o: object, p = ''): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [p + k] : keys(v, `${p}${k}.`)))

  it('has the same keys as English', () => {
    for (const [, messages] of LOCALES) expect(keys(messages.patch)).toEqual(keys(en.patch))
  })

  it.each(LOCALES)('%s renders every message with no raw keys or braces, and keeps game data and values', (locale, messages) => {
    const { t, tr } = translator(locale, messages)
    const values = { title: 'City Never Sleeps', date: '2026-10-05', id: '2026-10-05', label: 'Steam', count: 3, heroes: 2, abilities: 3, items: 4, hero: 'Haze', item: 'Mystic Burst', from: 6102, to: 6107, fromTime: 'x', toTime: 'y', source: 'game', tier: 3, value: '3000', range: 'r', a: 'A', b: 'B', rule: 'R' }
    for (const key of keys(en.patch)) {
      const text = /\.how\.(gameData|notes|direction|stats)$/.test(key) ? t.markup(key as 'untitled', { ...values, b: (c) => c }) : t(key as 'untitled', values)
      expect(text.length).toBeGreaterThan(0)
      expect(text).not.toMatch(/[{}]|\bpatch\.[a-z]/)
    }
    // Every change in the fixture: game labels and values pass through; this site's labels are translated.
    for (const c of newDiff.changes.flatMap((e) => e.changes)) {
      const label = propertyText(c.property, tr)
      if ('game' in c.property) expect(label).toBe(c.property.game)
      if (locale !== 'en' && 'site' in c.property) expect(label).not.toBe(propertyText(c.property, EN))
      expect(valueText(c.before, c.unit, tr)).toContain(c.before)
    }
    if (locale !== 'en') {
      expect(valueText('3000', 'souls', tr)).not.toContain('souls')
      expect(patchTitle({ id: '2026-10-05', title: null }, tr)).toContain('2026-10-05')
      expect(patchTitle({ id: '2026-10-05', title: null }, tr)).not.toContain('update')
    }
  })

  it.each(LOCALES)('%s keeps the UTC patch day and window days', (locale) => {
    for (const [iso, dayOfMonth, other] of [['2026-10-05', '5', '4'], ['2026-09-29', '29', '28'], ['2026-01-01', '1', '31']] as const) {
      for (const style of ['day', 'long', 'short'] as const) {
        const text = patchDate(day(iso), style, locale)
        expect(text.match(/\d+/g)).toContain(dayOfMonth)
        expect(text.match(/\d+/g)).not.toContain(other)
        if (style !== 'short') expect(text).toContain(iso.slice(0, 4)) // Gregorian year in every locale
      }
    }
    // [Sep 22, Sep 29) shows Sep 22 to Sep 28; a build at 23:59 UTC stays on its UTC day.
    const range = windowRange({ from: day('2026-09-22'), to: day('2026-09-29'), days: 7 }, 'short', locale, (_k, v) => `${v!.from}|${v!.to}`)
    expect(range.split('|').map((s) => s.match(/\d+/g)!.at(-1))).toEqual(['22', '28'])
    expect(patchDate(day('2026-10-04') + DAY - 60, 'build', locale).match(/\d+/g)).toEqual(expect.arrayContaining(['4', '23', '59']))
  })
})

// ── Cache ──────────────────────────────────────────────────────────

describe('the diff cache', () => {
  it('is patch-diff-v3, with no locale in its key', () => {
    const loaders = readFileSync('src/features/patches/loaders.ts', 'utf8')
    expect(loaders).toContain("['patch-diff-v3']")
    expect(loaders).not.toContain('patch-diff-v2')
    const call = loaders.slice(loaders.indexOf('const cachedDiff'), loaders.indexOf('async function diffBetween'))
    expect(call).not.toMatch(/locale|getLocale|useLocale/)
  })
})
