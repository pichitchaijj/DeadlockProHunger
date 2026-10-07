import { describe, expect, it } from 'vitest'
import { RANK_BANDS } from '@/lib/analytics/rankBands'
import { badgeLabel, bandRanks, RANK_METALS, rankCatalog, rankFromBadge, rankFromTier, rankImageUrl } from '@/lib/deadlock/rankAssets'
import { rankBandOptions } from '@/features/meta/rankFilter'

/* Synthetic catalog shaped like /v1/assets/ranks (12 tiers); URLs are placeholders. */
const NAMES = ['Obscurus', 'Initiate', 'Seeker', 'Acolyte', 'Sentinel', 'Mystic', 'Ritualist', 'Emissary', 'Oracle', 'Phantom', 'Ascendant', 'Eternus']
const img = (tier: number, ext: string) => `https://assets.example/ranks/rank${String(tier).padStart(2, '0')}_lg.${ext}`
const api = NAMES.map((name, tier) => ({ tier, name, images: { large: img(tier, 'png'), large_webp: img(tier, 'webp') } }))
const catalog = rankCatalog([...api].reverse()) // order from the API isn't trusted
const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI']
const METALS = [null, 'Brick', 'Stone', 'Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', null, null, null]

describe('rankCatalog', () => {
  it('sorts tiers and takes the WebP emblem first, PNG as fallback', () => {
    expect(catalog.map((r) => r.tier)).toEqual(NAMES.map((_, i) => i))
    expect(catalog[5].image).toBe(img(5, 'webp'))
    expect(rankImageUrl({ large: img(5, 'png') })).toBe(img(5, 'png'))
    expect(rankImageUrl(null)).toBeNull()
  })

  it('attaches the metal name per tier and none to the top tiers', () => {
    expect(catalog.map((r) => r.metal)).toEqual(METALS)
    expect(Object.keys(RANK_METALS)).toHaveLength(8)
  })
})

describe('rankFromBadge', () => {
  it('resolves every known tier and subrank', () => {
    for (let tier = 0; tier < NAMES.length; tier++) {
      for (let sub = 1; sub <= 6; sub++) {
        const r = rankFromBadge(catalog, tier * 10 + sub)
        expect(r).toEqual({
          badge: tier * 10 + sub,
          tier,
          subrank: sub,
          name: NAMES[tier],
          label: `${NAMES[tier]} ${NUMERALS[sub - 1]}`,
          metal: METALS[tier],
          src: img(tier, 'webp'),
          known: true,
        })
        expect(badgeLabel(tier * 10 + sub, new Map(NAMES.map((n, i) => [i, n])))).toBe(r!.label)
      }
    }
  })

  it('returns null for no rank', () => {
    expect(rankFromBadge(catalog, 0)).toBeNull()
    expect(rankFromBadge(catalog, null)).toBeNull()
    expect(rankFromBadge(catalog, undefined)).toBeNull()
    expect(badgeLabel(0, new Map())).toBeNull()
  })

  it('falls back for an unknown tier: readable name, no emblem', () => {
    expect(rankFromBadge(catalog, 153)).toMatchObject({ tier: 15, name: 'Tier 15', label: 'Tier 15 III', src: null, known: false, metal: null })
    // Catalog failed to load: still readable, metal from the static map, no emblem.
    expect(rankFromBadge([], 84)).toMatchObject({ label: 'Tier 8 IV', metal: 'Diamond', src: null, known: false })
  })

  it('drops a subrank outside 1–6 instead of printing garbage', () => {
    expect(rankFromBadge(catalog, 80)).toMatchObject({ label: 'Oracle', subrank: null })
    expect(rankFromBadge(catalog, 89)).toMatchObject({ label: 'Oracle', subrank: null })
  })
})

describe('rankFromTier', () => {
  it('resolves by tier number, rank name or metal name (case-insensitive)', () => {
    expect(rankFromTier(catalog, 8)).toMatchObject({ name: 'Oracle', label: 'Oracle', subrank: null, src: img(8, 'webp'), known: true })
    expect(rankFromTier(catalog, 'oracle')?.tier).toBe(8)
    expect(rankFromTier(catalog, ' Diamond ')?.tier).toBe(8)
    expect(rankFromTier(catalog, 'Eternus')).toMatchObject({ tier: 11, metal: null })
  })

  it('keeps an unknown name readable with no emblem', () => {
    expect(rankFromTier(catalog, 'Mythic')).toEqual({ badge: null, tier: null, subrank: null, name: 'Mythic', label: 'Mythic', metal: null, src: null, known: false })
    expect(rankFromTier(catalog, '')).toBeNull()
    expect(rankFromTier(catalog, null)).toBeNull()
    expect(rankFromTier(catalog, -1)).toBeNull()
  })
})

describe('rank bands', () => {
  it('every band tier exists in the catalog', () => {
    for (const band of RANK_BANDS) {
      const pair = bandRanks(band.tiers, catalog)
      if (!band.tiers) expect(pair).toBeNull()
      else expect(pair!.every((r) => r.known && r.src)).toBe(true)
    }
  })

  it('filter options carry emblems except "all ranks"', () => {
    const labels = { all: 'All ranks', low: 'Initiate – Sentinel', mid: 'Mystic – Emissary', high: 'Oracle – Phantom', top: 'Ascendant – Eternus' }
    const options = rankBandOptions(labels, catalog, (rank) => `/meta?rank=${rank}`)
    expect(options.map((o) => [o.value, o.label, o.href, Boolean(o.icon)])).toEqual([
      ['all', 'All ranks', '/meta?rank=all', false],
      ['low', 'Initiate – Sentinel', '/meta?rank=low', true],
      ['mid', 'Mystic – Emissary', '/meta?rank=mid', true],
      ['high', 'Oracle – Phantom', '/meta?rank=high', true],
      ['top', 'Ascendant – Eternus', '/meta?rank=top', true],
    ])
  })
})
