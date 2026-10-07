import { defineRouting } from 'next-intl/routing'
import { defaultLocale, locales } from './config'

/**
 * next-intl routing, used by src/proxy.ts.
 * - `as-needed`: English stays unprefixed (/heroes is rewritten to /en/heroes internally; /en/heroes
 *   redirects to /heroes), other locales are prefixed (/th/heroes).
 * - No detection: the locale comes from the URL only, never from Accept-Language or a cookie, so a URL
 *   always renders the same language (cacheable, crawlable).
 * - No locale cookie yet: next-intl would otherwise set NEXT_LOCALE on page responses. The language
 *   switcher phase turns it on together with the switcher (LOCALE_COOKIE in ./config).
 * - No hreflang Link header yet: hreflang belongs to the SEO phase.
 */
export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: 'as-needed',
  localeDetection: false,
  localeCookie: false,
  alternateLinks: false,
})
