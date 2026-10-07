import { describe, expect, it } from 'vitest'
import { primaryNav, secondaryNav } from '@/config/navigation'
import { locales } from '@/i18n/config'
import { getPathname, splitLocalePath, switchLocaleHref } from '@/i18n/navigation'

/** The language switcher's rule: same page, route params and query; English unprefixed. */
const switchTo = (url: string, locale: (typeof locales)[number]) => {
  const [pathname, search = ''] = url.split('?')
  return switchLocaleHref(pathname, search, locale)
}

describe('language switching', () => {
  it.each([
    ['/heroes', 'th', '/th/heroes'],
    ['/heroes', 'ja', '/ja/heroes'],
    ['/heroes', 'ko', '/ko/heroes'],
    ['/heroes', 'zh-CN', '/zh-CN/heroes'],
    ['/th/heroes', 'en', '/heroes'],
    ['/th/heroes', 'ja', '/ja/heroes'],
    ['/th/heroes?window=30d', 'ja', '/ja/heroes?window=30d'],
    ['/th/heroes?window=30d&rank=ascendant', 'ko', '/ko/heroes?window=30d&rank=ascendant'],
    ['/th/heroes/abrams', 'ja', '/ja/heroes/abrams'],
    ['/ja/items/foo', 'en', '/items/foo'],
    ['/ko/patch?search=abc', 'zh-CN', '/zh-CN/patch?search=abc'],
    ['/zh-CN/patch?search=abc&page=2', 'th', '/th/patch?search=abc&page=2'],
    ['/', 'th', '/th'],
    ['/th', 'en', '/'],
    ['/ko', 'ko', '/ko'],
    ['/heroes', 'en', '/heroes'],
  ] as const)('%s → %s = %s', (from, locale, to) => {
    expect(switchTo(from, locale)).toBe(to)
  })

  it('keeps query values exactly as they are (encoded characters, repeated keys)', () => {
    expect(switchLocaleHref('/th/players', 'q=a%20b&tag=1&tag=2', 'en')).toBe('/players?q=a%20b&tag=1&tag=2')
    expect(switchLocaleHref('/heroes', '?window=30d', 'ko')).toBe('/ko/heroes?window=30d')
  })

  it('never produces an /en prefix', () => {
    for (const from of ['/heroes', '/th/heroes', '/zh-CN/items/x?y=1', '/ja']) {
      expect(switchTo(from, 'en').startsWith('/en')).toBe(false)
    }
  })
})

describe('locale paths', () => {
  it('splits a browser pathname into locale and app path', () => {
    expect(splitLocalePath('/heroes')).toEqual({ locale: 'en', path: '/heroes' })
    expect(splitLocalePath('/th')).toEqual({ locale: 'th', path: '/' })
    expect(splitLocalePath('/zh-CN/patch/2026-10-05')).toEqual({ locale: 'zh-CN', path: '/patch/2026-10-05' })
    // A path that merely starts with a locale's letters is not a prefix (slugs are identity values).
    expect(splitLocalePath('/thermal')).toEqual({ locale: 'en', path: '/thermal' })
    expect(splitLocalePath('/kobold')).toEqual({ locale: 'en', path: '/kobold' })
  })

  it('prefixes internal links for the active locale and leaves English and slugs alone', () => {
    expect(getPathname({ href: '/heroes/abrams', locale: 'en' })).toBe('/heroes/abrams')
    expect(getPathname({ href: '/heroes/abrams', locale: 'th' })).toBe('/th/heroes/abrams')
    expect(getPathname({ href: '/items/extra-spirit?window=30d', locale: 'ja' })).toBe('/ja/items/extra-spirit?window=30d')
    expect(getPathname({ href: '/', locale: 'ko' })).toBe('/ko')
    expect(getPathname({ href: '/?rank=top', locale: 'zh-CN' })).toBe('/zh-CN?rank=top')
  })

  it('leaves external URLs unchanged', () => {
    for (const href of ['https://discord.com/invite/deadlockgame', 'https://deadlock-api.com', 'mailto:hi@example.com']) {
      for (const locale of locales) expect(getPathname({ href, locale })).toBe(href)
    }
  })

  it('localizes every navigation destination', () => {
    for (const item of [...primaryNav, ...secondaryNav]) {
      expect(getPathname({ href: item.href, locale: 'th' })).toBe(item.href === '/' ? '/th' : `/th${item.href}`)
      expect(getPathname({ href: item.href, locale: 'en' })).toBe(item.href)
    }
  })
})
