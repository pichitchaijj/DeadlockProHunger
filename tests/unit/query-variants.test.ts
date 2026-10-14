import { readFileSync } from 'node:fs'
import { NextIntlClientProvider } from 'next-intl'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Filter, FILTER_VARIANT_REL } from '@/components/ui/Filter'
import { queryVariantIndexing } from '@/i18n/seo'
import en from '@/i18n/messages/en'

/*
 * Query-string variants of pages backed by expensive analytics (hero-build-stats, ability-order-stats,
 * item-flow-stats, item-stats): each variant is a fresh set of upstream requests. robots.txt already disallows
 * them (seo.test.ts); for crawlers that fetch them anyway, the variant is noindex + nofollow and the filter links
 * that lead to more variants are rel="nofollow".
 */

describe('queryVariantIndexing', () => {
  it('leaves a clean URL to the page’s own indexing', () => {
    expect(queryVariantIndexing({})).toEqual({})
  })

  it('makes any query-string variant noindex + nofollow, whatever the parameter', () => {
    for (const params of [{ window: '30d' }, { rank: 'top', tab: 'builds' }, { hero: 'haze' }, { utm_source: 'x' }, { a: ['1', '2'] }]) {
      expect(queryVariantIndexing(params)).toEqual({ robots: { index: false, follow: false } })
    }
  })
})

describe('filter links on expensive pages', () => {
  function render(node: ReactElement): string {
    // oxlint-disable-next-line react/no-children-prop -- .ts test file (no JSX); the provider takes children as a prop
    return renderToStaticMarkup(createElement(NextIntlClientProvider, { locale: 'en', messages: en, children: node }))
  }

  it('FILTER_VARIANT_REL renders rel="nofollow" on every option, with unchanged URLs', () => {
    const options = [
      { value: '7d', label: '7 days', href: '/builds' },
      { value: '30d', label: '30 days', href: '/builds?window=30d' },
    ]
    const html = render(createElement(Filter, { label: 'Window', value: '7d', options, rel: FILTER_VARIANT_REL }))
    const anchors = [...html.matchAll(/<a\b([^>]*)>/g)].map(([, a]) => ({ href: /\bhref="([^"]*)"/.exec(a)?.[1], rel: /\brel="([^"]*)"/.exec(a)?.[1] }))
    expect(anchors).toEqual([
      { href: '/builds', rel: 'nofollow' },
      { href: '/builds?window=30d', rel: 'nofollow' },
    ])
  })

  // Source check: every <Filter> on these pages passes FILTER_VARIANT_REL (rendering them needs their full data).
  const FILTER_FILES = [
    'src/app/[lang]/builds/page.tsx',
    'src/app/[lang]/builds/[hero]/[buildId]/page.tsx',
    'src/app/[lang]/compare/page.tsx',
    'src/features/analyze/components/Controls.tsx',
    'src/features/analyze/components/Sections.tsx',
    'src/features/hero/components/HeroHeader.tsx',
    'src/features/hero/components/tabs.tsx',
    'src/features/items/components/ItemFilters.tsx',
  ]
  it.each(FILTER_FILES)('%s: every <Filter> is nofollow', (file) => {
    const source = readFileSync(file, 'utf8')
    const filters = source.match(/<Filter(?=[\s>])/g) ?? []
    expect(filters.length).toBeGreaterThan(0)
    expect(source.match(/<Filter rel=\{FILTER_VARIANT_REL\}/g)?.length).toBe(filters.length)
  })

  const METADATA_FILES = [
    'src/app/[lang]/builds/page.tsx',
    'src/app/[lang]/builds/[hero]/[buildId]/page.tsx',
    'src/app/[lang]/heroes/[hero]/page.tsx',
    'src/app/[lang]/items/page.tsx',
    'src/app/[lang]/items/[item]/page.tsx',
    'src/app/[lang]/analyze/page.tsx',
    'src/app/[lang]/compare/page.tsx',
  ]
  it.each(METADATA_FILES)('%s: generateMetadata applies queryVariantIndexing', (file) => {
    const source = readFileSync(file, 'utf8')
    const metadata = source.slice(source.indexOf('export async function generateMetadata'), source.indexOf('export default'))
    expect(metadata).toContain('queryVariantIndexing(')
  })
})
