import { describe, expect, it } from 'vitest'
import { direction, overallDirection, parseValue } from '@/features/patches/direction'
import { BROAD_MIN, diffSnapshots, snapshotEntities, splitBroadChanges, type EntityChange } from '@/features/patches/diff'
import {
  changeMarks,
  diffCounts,
  groupChanges,
  heroPickRates,
  itemBuyRates,
  mostImpacted,
  movements,
  noteCounts,
  patchesFromFeed,
  patchWindows,
  sumWindow,
  verdict,
} from '@/features/patches/model'
import { noteLinesFromHtml, parseNotes } from '@/features/patches/notes'
import { compareHref, parseCompareQuery, patchHref } from '@/features/patches/query'

const DAY = 86_400
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 1000

describe('direction rule', () => {
  it('treats lower cooldowns / costs as buffs and higher damage as buffs', () => {
    expect(direction('Base Cooldown', 28, 24)).toBe('buff')
    expect(direction('Cooldown', 130, 160)).toBe('nerf')
    expect(direction('Damage', 65, 70)).toBe('buff')
    expect(direction('Cost', 800, 1250)).toBe('nerf')
  })
  it('reads "reduction" properties and negative values by magnitude', () => {
    expect(direction('Damage Reduction', 20, 15)).toBe('nerf')
    expect(direction('Bullet Resist Reduction', -8, -7)).toBe('nerf')
    expect(direction('Damage Penalty', -10, -15)).toBe('nerf')
  })
  it('says "changed" for unknown properties, zero and sign flips', () => {
    expect(direction('Knight Charge Height', 3.5, 6)).toBe('changed')
    expect(direction('Damage', 0, 10)).toBe('changed')
    expect(direction('Damage', -5, 5)).toBe('changed')
    expect(direction('Damage', null, 5)).toBe('changed')
  })
  it('parses values with units and combines directions', () => {
    expect(parseValue('6.5m')).toEqual({ n: 6.5, unit: 'm' })
    expect(parseValue('-8.0')).toEqual({ n: -8, unit: '' })
    expect(parseValue('25-61').n).toBeNull()
    expect(overallDirection(['buff', 'changed', 'buff'])).toBe('buff')
    expect(overallDirection(['buff', 'nerf'])).toBe('mixed')
    expect(overallDirection(['changed'])).toBe('changed')
  })
})

describe('official notes', () => {
  // Real lines from the 10-05-2026 and 09-16-2026 Steam "Minor Update" posts.
  const html =
    '<p class="bb_paragraph">- Fixed bugs that were causing troopers to walk too slowly in lane</p><p class="bb_paragraph"></p>' +
    '<p class="bb_paragraph">- Rat King: Rat Swarm - Base Cooldown reduced from 28s to 24s</p>' +
    '<p class="bb_paragraph">- Rat King: Rule, Ratannia! - Damage Reduction reduced from 20% to 15%</p>' +
    '<p class="bb_paragraph">- Sinclair: Gun - Falloff range reduced from 25-61 to 20-60</p>' +
    '<p class="bb_paragraph">- Sinclair: Base HP Regen reduced from 2 to 1</p>' +
    '<p class="bb_paragraph">\\[ Items ]</p><p class="bb_paragraph">- Shadow Weave: Cooldown reduced from 45s to 37s</p>' +
    '<p class="bb_paragraph">- Veil Walker: No longer builds from Sprint Boots</p>'
  const lines = parseNotes(html, ['Rat King', 'Sinclair'], ['Shadow Weave', 'Veil Walker'])

  it('splits paragraphs into lines and strips list markers', () => {
    expect(noteLinesFromHtml(html)[0]).toBe('Fixed bugs that were causing troopers to walk too slowly in lane')
    expect(lines).toHaveLength(7)
  })

  it('classifies hero, ability, gun and item lines with from → to values', () => {
    expect(lines[0]).toMatchObject({ kind: 'general', property: null, direction: 'changed' })
    expect(lines[1]).toMatchObject({ kind: 'hero', subject: 'Rat King', component: 'Rat Swarm', property: 'Base Cooldown', before: '28s', after: '24s', direction: 'buff' })
    expect(lines[2]).toMatchObject({ component: 'Rule, Ratannia!', before: '20%', after: '15%', direction: 'nerf' })
    expect(lines[3]).toMatchObject({ component: 'Gun', before: '25-61', after: '20-60', direction: 'changed' })
    expect(lines[4]).toMatchObject({ component: null, property: 'Base HP Regen', direction: 'nerf' })
    expect(lines[5]).toMatchObject({ section: 'Items', kind: 'item', subject: 'Shadow Weave', direction: 'buff' })
    expect(lines[6]).toMatchObject({ kind: 'item', property: null, before: null })
  })

  it('counts heroes, abilities and items from the notes', () => {
    expect(noteCounts(lines)).toEqual({ heroes: 2, abilities: 2, items: 2, buffs: 2, nerfs: 2, changed: 1 })
  })
})

describe('patches from the feed', () => {
  const feed = [
    { source: 'steam' as const, title: ' Minor Update - 10-05-2026', pub_date: '2026-10-05T23:05:32Z', link: 'https://steam/1', content: '<p>- x</p>' },
    { source: 'forum' as const, title: '09-29-2026', pub_date: '2026-10-05T23:00:12Z', link: 'https://forum/1', content: 'preview' },
    { source: 'steam' as const, title: 'City Never Sleeps', pub_date: '2026-09-29T20:25:11Z', link: 'https://steam/2', content: 'announcement' },
    { source: 'steam' as const, title: 'Mind the Birds!', pub_date: '2026-10-06T20:59:54Z', link: 'https://steam/3', content: 'news' },
    { source: 'forum' as const, title: '09-16-2026 Update', pub_date: '2026-09-16T22:41:46Z', link: 'https://forum/2' },
  ]
  const patches = patchesFromFeed(feed)

  it('dates patches by title, names them from a same-day Steam post, and skips other news', () => {
    expect(patches.map((p) => p.id)).toEqual(['2026-10-05', '2026-09-29', '2026-09-16'])
    expect(patches[0]).toMatchObject({ notesHtml: '<p>- x</p>', title: '2026-10-05 update' })
    expect(patches[1]).toMatchObject({ title: 'City Never Sleeps', notesHtml: null })
    expect(patches[1].links.map((l) => l.href)).toEqual(['https://forum/1', 'https://steam/2'])
  })

  it('bounds windows by the neighbouring patches and today', () => {
    const w = patchWindows(patches, 1, day('2026-10-07'))
    expect(w.before).toEqual({ from: day('2026-09-22'), to: day('2026-09-29'), days: 7 })
    expect(w.after).toEqual({ from: day('2026-09-29'), to: day('2026-10-05'), days: 6 })
    const latest = patchWindows(patches, 0, day('2026-10-07'))
    expect(latest.after).toMatchObject({ to: day('2026-10-08'), days: 3 })
    expect(patchWindows(patches, 2, day('2026-10-07')).before.days).toBe(7)
  })
})

describe('game-data diff', () => {
  const hero = (stats: Record<string, number>, selectable = true) => ({
    id: 1,
    class_name: 'hero_rat',
    name: 'Rat King',
    player_selectable: selectable,
    disabled: false,
    items: { signature1: 'ability_rat_swarm', weapon_primary: 'weapon_rat' },
    starting_stats: Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, { value: v }])),
  })
  const items = (cd: string, dmg: number, cost: number) => [
    { id: 10, class_name: 'ability_rat_swarm', name: 'Rat Swarm', type: 'ability', properties: { AbilityCooldown: { value: cd, label: 'Cooldown', postfix: 's' }, Hidden: { value: '3' } } },
    { id: 11, class_name: 'weapon_rat', name: 'Rat Gun', type: 'weapon', weapon_info: { bullet_damage: dmg, damage_falloff_start_range: 787 } },
    { id: 12, class_name: 'upgrade_x', name: 'Shadow Weave', type: 'upgrade', shopable: true, cost, item_slot_type: 'spirit', properties: {} },
    { id: 13, class_name: 'ability_internal', name: 'ability_internal', type: 'ability', properties: { A: { value: '1', label: 'A' } } },
  ]
  const before = snapshotEntities({ heroes: [hero({ max_health: 730 })], items: items('28', 17.76, 3000) })
  const after = snapshotEntities({ heroes: [hero({ max_health: 700 })], items: items('24', 16.5, 3000) })

  it('keeps player-facing entities only, with readable values', () => {
    expect([...before.keys()].sort()).toEqual(['hero:1', 'item:10', 'item:11', 'item:12'])
    expect(before.get('item:11')!.props.damage_falloff_start_range.text).toBe('19.99m')
    expect(before.get('item:12')!.props.cost.text).toBe('3000 souls')
  })

  it('reports changed values with direction, and unlabeled values as changed', () => {
    const changes = diffSnapshots(before, after)
    const byKey = new Map(changes.map((c) => [c.key, c]))
    expect(byKey.get('item:10')!.changes).toEqual([{ property: 'Cooldown', before: '28s', after: '24s', direction: 'buff' }])
    expect(byKey.get('item:11')!.changes[0]).toMatchObject({ property: 'Bullet damage', before: '17.76', after: '16.5', direction: 'nerf' })
    expect(byKey.get('hero:1')!.changes[0]).toMatchObject({ property: 'Max health', direction: 'nerf' })
    expect(byKey.has('item:12')).toBe(false)
  })

  it('reports new heroes once (not their abilities) and removed items', () => {
    const empty = snapshotEntities({ heroes: [], items: [] })
    const added = diffSnapshots(empty, after)
    expect(added.map((c) => `${c.key}:${c.status}`).sort()).toEqual(['hero:1:new', 'item:12:new'])
    expect(diffSnapshots(after, empty).map((c) => `${c.key}:${c.status}`).sort()).toEqual(['hero:1:removed', 'item:12:removed'])
  })

  it('ignores a display-unit change when the number is the same', () => {
    const ability = (v: string, postfix: string) => ({
      heroes: [hero({})],
      items: [{ id: 10, class_name: 'ability_rat_swarm', name: 'Rat Swarm', type: 'ability', properties: { Bleed: { value: v, label: 'Bleed Damage', postfix } } }],
    })
    expect(diffSnapshots(snapshotEntities(ability('2', '%/sec')), snapshotEntities(ability('2', '% DPS')))).toEqual([])
  })

  it('collapses identical changes on many entries into broad changes', () => {
    const entity = (i: number, extra: EntityChange['changes'] = []): EntityChange => ({
      key: `item:${i}`, kind: 'item', id: i, name: `Item ${i}`, heroId: null, slot: null, status: 'changed', direction: 'changed',
      changes: [{ property: 'Channel Move Speed', before: '50m/s', after: '-1m/s', direction: 'changed' }, ...extra],
    })
    const list = Array.from({ length: BROAD_MIN }, (_, i) => entity(i, i === 0 ? [{ property: 'Cooldown', before: '20s', after: '18s', direction: 'buff' }] : []))
    const { changes, broad } = splitBroadChanges(list)
    expect(broad).toEqual([{ property: 'Channel Move Speed', before: '50m/s', after: '-1m/s', direction: 'changed', count: BROAD_MIN }])
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ id: 0, direction: 'buff', changes: [{ property: 'Cooldown' }] })
    expect(splitBroadChanges(list.slice(0, BROAD_MIN - 1)).broad).toEqual([])
  })

  it('groups per hero and counts', () => {
    const changes = diffSnapshots(before, after)
    const g = groupChanges(changes, { 1: 'Rat King' })
    expect(g.heroes).toHaveLength(1)
    expect(g.heroes[0].parts.map((p) => p.kind)).toEqual(['hero', 'weapon', 'ability'])
    expect(g.heroes[0].direction).toBe('mixed')
    expect(diffCounts(g.heroes, g.items)).toEqual({ heroes: 1, abilities: 1, items: 0, buffs: 1, nerfs: 2, changed: 0 })
    expect(changeMarks(g.heroes, g.items).heroes.get(1)).toBe('mixed')
  })
})

describe('before / after statistics', () => {
  const w = { before: { from: 0, to: 7 * DAY, days: 7 }, after: { from: 7 * DAY, to: 14 * DAY, days: 7 } }
  const rows = [
    { id: 1, day: 0, wins: 4_800, matches: 10_000 },
    { id: 1, day: 8 * DAY, wins: 5_400, matches: 10_000 },
    { id: 2, day: 1 * DAY, wins: 5_000, matches: 10_000 },
    { id: 2, day: 9 * DAY, wins: 5_020, matches: 10_000 },
    { id: 3, day: 2 * DAY, wins: 60, matches: 100 },
    { id: 3, day: 10 * DAY, wins: 30, matches: 100 },
  ]
  const a = sumWindow(rows, w.before)
  const b = sumWindow(rows, w.after)
  const moves = movements([1, 2, 3], a, b, { a: heroPickRates(a), b: heroPickRates(b) })

  it('sums each window and applies the clear-change rule', () => {
    expect(moves[0]).toMatchObject({ verdict: 'higher' })
    expect(moves[0].winDelta).toBeCloseTo(0.06)
    expect(moves[1].verdict).toBe('no clear change')
    expect(moves[2].verdict).toBe('not enough data')
    expect(verdict(null, moves[0].after)).toBe('not enough data')
  })

  it('lists only clear movers as most impacted', () => {
    const m = mostImpacted(moves)
    expect(m.up.map((r) => r.id)).toEqual([1])
    expect(m.down).toEqual([])
  })

  it('computes pick and buy rates per period', () => {
    expect(heroPickRates(new Map([[1, { matches: 6 }], [2, { matches: 6 }]])).get(1)).toBeCloseTo(6)
    expect(itemBuyRates(new Map([[9, { matches: 50 }]]), new Map([[1, { matches: 200 }]])).get(9)).toBe(0.25)
  })
})

describe('patch query', () => {
  it('parses and builds URLs', () => {
    const q = parseCompareQuery({ a: '2026-09-16', b: 'bad', hero: 'haze', rank: 'top', mode: 'ranked' })
    expect(q).toEqual({ hero: 'haze', item: 'all', rank: 'top', mode: 'ranked', a: '2026-09-16', b: null })
    expect(patchHref('2026-10-05', q)).toBe('/patch/2026-10-05?hero=haze&rank=top&mode=ranked')
    expect(compareHref(q, { b: '2026-10-05' })).toBe('/patch/compare?hero=haze&rank=top&mode=ranked&a=2026-09-16&b=2026-10-05')
  })
})
