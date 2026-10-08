import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'
import type { Locale } from '@/i18n/config'
import en from '@/i18n/messages/en'
import ja from '@/i18n/messages/ja'
import ko from '@/i18n/messages/ko'
import th from '@/i18n/messages/th'
import zhCN from '@/i18n/messages/zh-CN'
import { makeScopeWording } from '@/components/data/scopeWording'
import { RANK_BANDS, rankBandLabel, rankBandRef, type RankBandId } from '@/lib/analytics/rankBands'
import type { ScopeRank, ScopeRef, ScopeWindow, StatScope } from '@/lib/analytics/scope'
import { formatInteger } from '@/lib/format'

/*
 * Shared scope wording (lib/analytics/scopeText via components/data/scopeWording). The English oracle is the
 * pre-localization code that assembled the labels (meta/scope.ts, items/loaders, ScopeLine, hero/loaders,
 * Compare/Draft chips, Analyze), copied verbatim; the scope values themselves never depend on the locale.
 */

const wording = (locale: Locale, messages: typeof en) => {
  const t = createTranslator({ locale, messages, namespace: 'scope' })
  return makeScopeWording((key, values) => t(key as 'joined', values), locale)
}
const EN = wording('en', en)
const LOCALES: Array<[Locale, typeof en]> = [['en', en], ['th', th], ['ja', ja], ['ko', ko], ['zh-CN', zhCN]]

// ── Pre-localization English (verbatim) ──
const DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const oldWindowLabels = (patchStart: number | null) => ({
  patch: patchStart === null ? 'Current patch' : `Current patch (since ${DATE.format(patchStart * 1000)})`,
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
})
const oldScopeLine = (windowLabel: string, rankLabel: string, sampleSize?: number) => {
  const parts = [windowLabel, rankLabel]
  if (sampleSize !== undefined) parts.push(`n = ${formatInteger(sampleSize)}`)
  return parts.join(' · ')
}
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

const tierNames = new Map([[1, 'Initiate'], [4, 'Sentinel'], [5, 'Mystic'], [7, 'Emissary'], [8, 'Oracle'], [9, 'Phantom'], [10, 'Ascendant'], [11, 'Eternus']])
const PATCH_DAY = Date.UTC(2026, 8, 29) / 1000
const windows = (patchStart: number | null): Record<'patch' | '7d' | '30d', ScopeWindow> => ({ patch: { kind: 'patch', since: patchStart }, '7d': { kind: 'days', days: 7 }, '30d': { kind: 'days', days: 30 } })

describe('scope values', () => {
  it('maps every rank band to a value (tier names are data, kept as given)', () => {
    expect(RANK_BANDS.map((b) => rankBandRef(b, tierNames))).toEqual([
      { kind: 'all' },
      { kind: 'band', from: { tier: 1, name: 'Initiate' }, to: { tier: 4, name: 'Sentinel' } },
      { kind: 'band', from: { tier: 5, name: 'Mystic' }, to: { tier: 7, name: 'Emissary' } },
      { kind: 'band', from: { tier: 8, name: 'Oracle' }, to: { tier: 9, name: 'Phantom' } },
      { kind: 'band', from: { tier: 10, name: 'Ascendant' }, to: { tier: 11, name: 'Eternus' } },
    ])
    expect(rankBandRef(RANK_BANDS[3], new Map())).toEqual({ kind: 'band', from: { tier: 8, name: null }, to: { tier: 9, name: null } })
  })

  it('never depends on the locale, and wording never changes the value', () => {
    const value: StatScope = { window: { kind: 'patch', since: PATCH_DAY }, rank: rankBandRef(RANK_BANDS[3], tierNames), ranked: true, hero: 'Haze', sampleSize: 12_400, source: 'live' }
    const copy = structuredClone(value)
    for (const [locale, messages] of LOCALES) {
      const w = wording(locale, messages)
      w.line(value)
      w.scope(value)
      w.window(value.window, { inSentence: true })
      w.rankLabels(Object.fromEntries(RANK_BANDS.map((b) => [b.id, rankBandRef(b, tierNames)])) as Record<RankBandId, ScopeRank>)
    }
    expect(value).toEqual(copy)
  })
})

describe('English matches the original labels', () => {
  it('windows: every preset, with and without a patch date; chips drop the date', () => {
    for (const patchStart of [null, PATCH_DAY, Date.UTC(2026, 0, 2) / 1000]) {
      const old = oldWindowLabels(patchStart)
      expect(EN.windowLabels(windows(patchStart))).toEqual(old)
      // Compare / Draft chips: the label without "(since …)".
      const chips = EN.windowLabels(windows(patchStart), { short: true })
      expect(chips).toEqual(Object.fromEntries(Object.entries(old).map(([k, v]) => [k, v.replace(/ \(since .*\)/, '')])))
      // Analyze's trend sentence: the label with a lowercase first letter.
      for (const k of ['patch', '7d', '30d'] as const) expect(EN.window(windows(patchStart)[k], { inSentence: true })).toBe(lowerFirst(old[k]))
    }
  })

  it('rank bands: all ranks, tier ranges, a single tier, and unknown tier names', () => {
    for (const names of [tierNames, new Map<number, string>(), new Map([[8, 'Oracle']])]) {
      expect(EN.rankLabels(Object.fromEntries(RANK_BANDS.map((b) => [b.id, rankBandRef(b, names)])) as never)).toEqual(Object.fromEntries(RANK_BANDS.map((b) => [b.id, rankBandLabel(b, names)])))
    }
    expect(EN.rank({ kind: 'band', from: { tier: 11, name: 'Eternus' }, to: { tier: 11, name: 'Eternus' } })).toBe(rankBandLabel({ id: 'top', tiers: [11, 11] }, tierNames))
  })

  it('scope text, scope line and the narrowing suffixes, for every window × rank combination', () => {
    for (const patchStart of [null, PATCH_DAY]) {
      const oldW = oldWindowLabels(patchStart)
      for (const [key, w] of Object.entries(windows(patchStart)) as Array<['patch' | '7d' | '30d', ScopeWindow]>) {
        for (const band of RANK_BANDS) {
          const rank = rankBandRef(band, tierNames)
          const oldR = rankBandLabel(band, tierNames)
          // meta/scope.ts scopeText, builds/loaders, hero insight scope
          expect(EN.scope({ window: w, rank })).toBe(`${oldW[key]}, ${oldR}`)
          for (const ranked of [false, true]) {
            for (const hero of [undefined, 'Mo & Krill']) {
              const s: ScopeRef = { window: w, rank, ranked, hero }
              // items/loaders rankLabel and meta statScope rankLabel: rank + modeText + hero players
              const oldRank = `${oldR}${ranked ? ' · Ranked only' : ''}${hero ? ` · ${hero} players` : ''}`
              expect(EN.rankScope(s)).toBe(oldRank)
              // items purchase-timing scope text
              expect(EN.scope(s)).toBe(`${oldW[key]}, ${oldRank}`)
              // ScopeLine and Home's summary note, with and without a sample size
              expect(EN.line(s)).toBe(oldScopeLine(oldW[key], oldRank))
              expect(EN.line({ ...s, sampleSize: 1_234_567, source: 'live' })).toBe(oldScopeLine(oldW[key], oldRank, 1_234_567))
            }
          }
        }
      }
    }
  })

  it('the insight scopes Hero Detail used to assemble', () => {
    const rank = rankBandRef(RANK_BANDS[2], tierNames)
    expect(EN.scope({ window: { kind: 'days', days: 14 }, rank })).toBe(`Last 14 days, ${rankBandLabel(RANK_BANDS[2], tierNames)}`)
    expect(EN.scope({ window: { kind: 'days', days: 14 }, rank: { kind: 'all' } })).toBe('Last 14 days, All ranks')
    for (const patchStart of [null, PATCH_DAY]) {
      expect(EN.scope({ window: windows(patchStart).patch, rank: { kind: 'everyBand' } })).toBe(`${oldWindowLabels(patchStart).patch}, every rank band`)
    }
    expect(EN.scope({ window: { kind: 'days', days: 30 }, rank: { kind: 'everyBand' } })).toBe('Last 30 days, every rank band')
  })

  it('the snapshot note and text scopes pass through', () => {
    const at = Date.UTC(2026, 9, 8, 14, 5)
    expect(EN.snapshot(at)).toBe(`· Data from ${new Date(at).toUTCString().slice(5, 22)} UTC`)
    expect(EN.line({ window: { kind: 'text', text: 'Oct 3 vs Sep 5' }, rank: { kind: 'text', text: 'All ranks' }, sampleSize: 900, source: 'live' })).toBe('Oct 3 vs Sep 5 · All ranks · n = 900')
  })
})

describe('every locale', () => {
  const value: ScopeRef = { window: { kind: 'patch', since: PATCH_DAY }, rank: rankBandRef(RANK_BANDS[3], tierNames), ranked: true, hero: 'Haze' }

  it.each(LOCALES)('%s words every branch with no raw keys, braces or English UI words', (locale, messages) => {
    const w = wording(locale, messages)
    const texts = [
      ...Object.values(w.windowLabels(windows(null))),
      ...Object.values(w.windowLabels(windows(PATCH_DAY))),
      ...Object.values(w.windowLabels(windows(PATCH_DAY), { short: true })),
      w.window({ kind: 'days', days: 14 }),
      w.window(windows(PATCH_DAY).patch, { inSentence: true }),
      w.rank({ kind: 'all' }),
      w.rank({ kind: 'everyBand' }),
      w.rank({ kind: 'band', from: { tier: 8, name: null }, to: { tier: 9, name: null } }),
      w.rankScope(value),
      w.scope(value),
      w.line({ ...value, sampleSize: 12_400, source: 'live' }),
      w.snapshot(Date.UTC(2026, 9, 8, 14, 5)),
    ]
    for (const text of texts) {
      expect(text.length).toBeGreaterThan(0)
      expect(text).not.toMatch(/[{}]|\bscope\.|\bwindow\.|\brank\./)
      if (locale !== 'en') expect(text).not.toMatch(/\b(Last|days|Current|patch|since|All ranks|Tier|every|Ranked only|players|Data from)\b/)
    }
    // Game data passes through; the patch date and sample are formatted for the locale.
    expect(w.scope(value)).toContain('Oracle')
    expect(w.scope(value)).toContain('Phantom')
    expect(w.scope(value)).toContain('Haze')
    expect(w.window(windows(PATCH_DAY).patch)).toContain(new Intl.DateTimeFormat(locale === 'th' ? 'th-TH-u-ca-gregory' : locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(PATCH_DAY * 1000).replace(/\s/g, ' ').split(' ')[0])
    expect(w.line({ ...value, sampleSize: 12_400, source: 'live' })).toContain(formatInteger(12_400, locale))
  })
})
