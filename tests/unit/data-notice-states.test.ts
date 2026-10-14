import { NextIntlClientProvider } from 'next-intl'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DataNotice } from '@/components/data/DataState'
import en from '@/i18n/messages/en'
import ja from '@/i18n/messages/ja'
import ko from '@/i18n/messages/ko'
import th from '@/i18n/messages/th'
import zhCN from '@/i18n/messages/zh-CN'

/*
 * `pending` (cache-only data not prepared yet) and `limited` (a scope the costly analytics aren't computed for)
 * render as neutral notices with no numbers, in every locale; failures (forbidden, rate-limit, …) stay alerts.
 */
const LOCALES = { en, th, ja, ko, 'zh-CN': zhCN } as const

function render(locale: keyof typeof LOCALES, node: ReactElement): string {
  // oxlint-disable-next-line react/no-children-prop -- .ts test file (no JSX); the provider takes children as a prop
  return renderToStaticMarkup(createElement(NextIntlClientProvider, { locale, messages: LOCALES[locale], children: node }))
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, ' ')

describe.each(Object.keys(LOCALES) as Array<keyof typeof LOCALES>)('DataNotice states (%s)', (locale) => {
  const source = LOCALES[locale].errors.source

  it('limited: a neutral notice with the localized reason and a link to the default filters (not a retry)', () => {
    const html = render(locale, createElement(DataNotice, { error: 'limited', what: 'Builds', defaultHref: '/builds', action: createElement('a', { href: '/builds?rank=low' }, 'retry') }))
    expect(html).not.toContain('role="alert"')
    expect(text(html)).toContain(source.limited)
    expect(text(html)).toContain(source.useDefaultFilters)
    expect(html).toContain('href="')
    expect(html).not.toContain('retry')
    expect(text(html)).toContain('Builds: default filters only')
  })

  it('pending: a neutral notice with the localized reason, keeping the page’s own action', () => {
    const html = render(locale, createElement(DataNotice, { error: 'pending', what: 'Builds', action: createElement('a', { href: '/builds' }, 'retry') }))
    expect(html).not.toContain('role="alert"')
    expect(text(html)).toContain(source.pending)
    expect(html).toContain('retry')
    expect(text(html)).toContain('Builds: not prepared yet')
  })

  it('refused access is still an alert with its own wording, never the pending or limited text', () => {
    const html = render(locale, createElement(DataNotice, { error: 'forbidden', what: 'Builds', defaultHref: '/builds' }))
    expect(html).toContain('role="alert"')
    expect(text(html)).toContain(source.forbidden)
    expect(text(html)).not.toContain(source.pending)
    expect(text(html)).not.toContain(source.limited)
    expect(text(html)).not.toContain(source.useDefaultFilters)
  })

  it('the new messages are real sentences in the locale, not copies of English (except en)', () => {
    for (const key of ['pending', 'limited', 'useDefaultFilters'] as const) {
      expect(source[key].trim().length).toBeGreaterThan(0)
      if (locale !== 'en') expect(source[key]).not.toBe(en.errors.source[key])
    }
  })
})
