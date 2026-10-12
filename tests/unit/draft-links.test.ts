import { NextIntlClientProvider } from 'next-intl'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Filter } from '@/components/ui/Filter'
import { HeroPicker, TeamSlots } from '@/features/draft/components/Board'
import { Recommendations } from '@/features/draft/components/Insights'
import type { DraftHero, Recommendation } from '@/features/draft/model'
import { DRAFT_STATE_REL, parseDraftQuery } from '@/features/draft/query'
import en from '@/i18n/messages/en'

/*
 * Draft Lab state links (add, remove, side, clear, recommendation, filters) carry rel="nofollow", with their
 * URLs unchanged; Filter outside Draft Lab renders no rel. Synthetic heroes; icon URLs are placeholders.
 */

function render(node: ReactElement): string {
  // oxlint-disable-next-line react/no-children-prop -- this test file is .ts (no JSX); createElement needs children in props for the provider type
  return renderToStaticMarkup(createElement(NextIntlClientProvider, { locale: 'en', messages: en, children: node }))
}

/** Every <a> in the markup: its href (entities decoded) and rel. */
function anchors(html: string): { href: string; rel: string | null }[] {
  return [...html.matchAll(/<a\b([^>]*)>/g)].map(([, attrs]) => ({
    href: (/\bhref="([^"]*)"/.exec(attrs)?.[1] ?? '').replace(/&amp;/g, '&'),
    rel: /\brel="([^"]*)"/.exec(attrs)?.[1] ?? null,
  }))
}

const hero = (id: number, slug: string, name: string, role: string): DraftHero => ({ id, slug, name, role, iconUrl: `https://assets.example/${slug}.webp` })
const heroes = [hero(1, 'abrams', 'Abrams', 'brawler'), hero(2, 'haze', 'Haze', 'assassin'), hero(3, 'seven', 'Seven', 'mystic')]

describe('Draft state links', () => {
  it('uses nofollow', () => {
    expect(DRAFT_STATE_REL).toBe('nofollow')
  })

  it('board: add, remove, side and clear links are nofollow, with the same draft URLs', () => {
    const query = parseDraftQuery({ allies: 'haze', enemies: 'seven' })
    const html = render(createElement('div', null, createElement(TeamSlots, { query, allies: [heroes[1]], enemies: [heroes[2]], base: new Map() }), createElement(HeroPicker, { query, heroes })))
    const links = anchors(html)
    expect(links.map((l) => l.href).sort()).toEqual(
      [
        '/draft?allies=haze,abrams&enemies=seven', // add Abrams to allies
        '/draft?enemies=seven', // remove Haze
        '/draft?allies=haze', // remove Seven
        '/draft?allies=haze&enemies=seven&side=enemies', // add to the enemy side
        '/draft', // clear
      ].sort(),
    )
    for (const l of links) expect(l.rel, l.href).toBe('nofollow')
  })

  it('board on an empty draft: hero links are nofollow too', () => {
    const links = anchors(render(createElement(HeroPicker, { query: parseDraftQuery({}), heroes })))
    expect(links.map((l) => l.href)).toEqual(['/draft?allies=abrams', '/draft?allies=haze', '/draft?allies=seven'])
    for (const l of links) expect(l.rel).toBe('nofollow')
  })

  it('recommendations: the add link is nofollow', () => {
    const rec: Recommendation = { hero: heroes[0], relations: [], confidence: 'high', score: 1, missing: 0, newRole: null } as unknown as Recommendation
    const links = anchors(render(createElement(Recommendations, { query: parseDraftQuery({ enemies: 'seven' }), recs: [rec], heroes, hasPicks: true, alliesFull: false })))
    expect(links).toEqual([{ href: '/draft?allies=abrams&enemies=seven', rel: 'nofollow' }])
  })
})

describe('Filter rel', () => {
  const options = [
    { value: '7d', label: '7 days', href: '/meta' },
    { value: '30d', label: '30 days', href: '/meta?window=30d' },
  ]

  it('renders no rel by default (every page but Draft Lab)', () => {
    const links = anchors(render(createElement(Filter, { label: 'Window', value: '7d', options })))
    expect(links.map((l) => l.href)).toEqual(['/meta', '/meta?window=30d'])
    for (const l of links) expect(l.rel).toBeNull()
  })

  it('passes the given rel to every option link (Draft Lab)', () => {
    const draft = [
      { value: '7d', label: '7 days', href: '/draft?allies=haze' },
      { value: '30d', label: '30 days', href: '/draft?allies=haze&window=30d' },
    ]
    const links = anchors(render(createElement(Filter, { label: 'Window', value: '7d', options: draft, rel: DRAFT_STATE_REL })))
    expect(links).toEqual([
      { href: '/draft?allies=haze', rel: 'nofollow' },
      { href: '/draft?allies=haze&window=30d', rel: 'nofollow' },
    ])
  })
})
