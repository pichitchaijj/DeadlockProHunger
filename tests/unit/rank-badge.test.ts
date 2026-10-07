import { NextIntlClientProvider } from 'next-intl'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RankBadge, RankBandIcons } from '@/components/game-assets/RankBadge'
import { RANK_ICON_PX } from '@/components/game-assets/RankEmblem'
import { rankFromBadge, rankFromTier, type RankCatalog } from '@/lib/deadlock/rankAssets'
import en from '@/i18n/messages/en'

/* Synthetic catalog; URLs are placeholders. */
const catalog: RankCatalog = [
  { tier: 5, name: 'Mystic', metal: 'Silver', image: 'https://assets.example/rank05_lg.webp' },
  { tier: 8, name: 'Oracle', metal: 'Diamond', image: 'https://assets.example/rank08_lg.webp' },
  { tier: 11, name: 'Eternus', metal: null, image: null },
]
const oracle = rankFromBadge(catalog, 84)!
/** Renders inside the English translation provider, as the app does (RankBadge reads "Unranked", "Tier:"). */
function inEnglish(Provider: typeof NextIntlClientProvider, node: ReactElement) {
  // oxlint-disable-next-line react/no-children-prop -- this test file is .ts (no JSX); createElement needs children in props for the provider type
  return renderToStaticMarkup(createElement(Provider, { locale: 'en', messages: en, children: node }))
}
const html = (props: Parameters<typeof RankBadge>[0]) => inEnglish(NextIntlClientProvider, createElement(RankBadge, props))

describe('RankBadge', () => {
  it('compact: emblem + readable name, emblem decorative (name is printed)', () => {
    const out = html({ rank: oracle })
    expect(out).toContain('src="https://assets.example/rank08_lg.webp"')
    expect(out).toContain('alt=""')
    expect(out).toContain('>Oracle IV<')
    expect(out).toContain(`width="${RANK_ICON_PX.sm}"`)
    expect(out).not.toContain('Diamond') // compact leaves the metal out
  })

  it('full: larger emblem, name and metal', () => {
    const out = html({ rank: oracle, variant: 'full' })
    expect(out).toContain(`width="${RANK_ICON_PX.lg}"`)
    expect(out).toContain('>Oracle IV<')
    expect(out).toContain('Tier: </span>Diamond')
  })

  it('full without a metal (top tiers) omits the metal line', () => {
    const out = html({ rank: rankFromBadge(catalog, 112), variant: 'full' })
    expect(out).toContain('>Eternus II<')
    expect(out).not.toContain('Tier: ')
  })

  it('icon only: the emblem carries the rank name as alt text', () => {
    const out = html({ rank: oracle, iconOnly: true })
    expect(out).toContain('alt="Oracle IV"')
    expect(out).not.toContain('>Oracle IV<')
  })

  it('missing asset renders the original fallback, never a broken image', () => {
    const eternus = rankFromBadge(catalog, 112)
    const out = html({ rank: eternus })
    expect(out).not.toContain('<img')
    expect(out).toContain('data-rank-fallback')
    expect(out).toContain('aria-hidden="true"')
    expect(out).toContain('>II<') // subrank numeral inside the shield
    expect(out).toContain('>Eternus II<')

    const unknown = html({ rank: rankFromTier(catalog, 'Mythic'), iconOnly: true })
    expect(unknown).toContain('role="img"')
    expect(unknown).toContain('aria-label="Mythic"')
  })

  it('no rank: fallback emblem and an "Unranked" (or custom) label', () => {
    expect(html({ rank: null })).toContain('>Unranked<')
    expect(html({ rank: null, emptyLabel: 'No current rank' })).toContain('>No current rank<')
    expect(html({ rank: null, iconOnly: true })).toContain('aria-label="Unranked"')
  })

  it('xs size for running text and filters', () => {
    const out = html({ rank: oracle, size: 'xs' })
    expect(out).toContain(`width="${RANK_ICON_PX.xs}"`)
  })
})

describe('RankBandIcons', () => {
  it('shows the first and last tier emblems, hidden from screen readers', () => {
    const out = renderToStaticMarkup(createElement(RankBandIcons, { ranks: [rankFromTier(catalog, 5)!, rankFromTier(catalog, 8)!] }))
    expect(out.startsWith('<span aria-hidden="true"')).toBe(true)
    expect(out.match(/<img/g)).toHaveLength(2)
  })

  it('renders one emblem for a single-tier band and nothing for "all ranks"', () => {
    const one = rankFromTier(catalog, 8)!
    expect(renderToStaticMarkup(createElement(RankBandIcons, { ranks: [one, one] })).match(/<img/g)).toHaveLength(1)
    expect(renderToStaticMarkup(createElement(RankBandIcons, { ranks: null }))).toBe('')
  })
})

describe('game-asset kill switch', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('NEXT_PUBLIC_GAME_ASSETS=off renders the fallback with the name still readable', async () => {
    vi.stubEnv('NEXT_PUBLIC_GAME_ASSETS', 'off')
    vi.resetModules()
    const { RankBadge: Badge } = await import('@/components/game-assets/RankBadge')
    // Fresh module graph after resetModules: the provider must come from the same next-intl instance.
    const { NextIntlClientProvider: Provider } = await import('next-intl')
    const out = inEnglish(Provider, createElement(Badge, { rank: oracle }))
    expect(out).not.toContain('<img')
    expect(out).toContain('data-rank-fallback')
    expect(out).toContain('>Oracle IV<')
  })
})
