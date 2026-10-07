/*
 * Locale configuration: the single list of supported locales and the pure URL helpers around them.
 * Plain constants and functions only, so client components, the proxy and tests can import it.
 *
 * Routing (src/i18n/routing.ts, src/proxy.ts): English is unprefixed (/heroes); every other locale is
 * a path prefix (/th/heroes). Pages live under app/[lang]; the proxy rewrites unprefixed URLs to /en/….
 */

export const locales = ['en', 'th', 'ja', 'ko', 'zh-CN'] as const
export type Locale = (typeof locales)[number]

/** The source locale: its messages are complete and every other locale falls back to them. */
export const defaultLocale: Locale = 'en'

/**
 * Cookie that will hold an explicit language choice (the locale switcher, a later phase). Not read or
 * written yet: there is no automatic redirect from it or from Accept-Language.
 */
export const LOCALE_COOKIE = 'NEXT_LOCALE'

/** Each language's name in its own script (what a language switcher shows; never translated). */
export const localeEndonyms: Record<Locale, string> = {
  en: 'English',
  th: 'ไทย',
  ja: '日本語',
  ko: '한국어',
  'zh-CN': '简体中文',
}

/**
 * The Intl locale used to format numbers and dates. English keeps 'en-US' (today's output); Thai pins
 * the Gregorian calendar (th-TH defaults to the Buddhist one, which would shift every year by 543).
 */
export const formatLocales: Record<Locale, string> = {
  en: 'en-US',
  th: 'th-TH-u-ca-gregory',
  ja: 'ja-JP',
  ko: 'ko-KR',
  'zh-CN': 'zh-CN',
}

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value)
}

/** The URL prefix of a locale: '' for English, '/th' for Thai. */
export function localePrefix(locale: Locale): string {
  return locale === defaultLocale ? '' : `/${locale}`
}

/** An app path ('/', '/heroes?x=1') as a link for `locale`: '/th', '/th/heroes?x=1'. English is unchanged. */
export function localizeHref(href: string, locale: Locale): string {
  const prefix = localePrefix(locale)
  if (!prefix || !href.startsWith('/')) return href
  return href === '/' ? prefix : href.startsWith('/?') ? `${prefix}${href.slice(1)}` : `${prefix}${href}`
}

/** A browser pathname split into its locale and the app path: '/th/heroes' → { th, '/heroes' }. */
export function splitLocale(pathname: string): { locale: Locale; pathname: string } {
  const [, first = ''] = pathname.split('/')
  const locale = locales.find((l) => l !== defaultLocale && l === first)
  if (!locale) return { locale: defaultLocale, pathname }
  return { locale, pathname: pathname.slice(locale.length + 1) || '/' }
}
