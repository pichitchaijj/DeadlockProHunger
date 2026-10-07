import { getRequestConfig } from 'next-intl/server'
import { lang } from 'next/root-params'
import { defaultLocale, isLocale } from './config'
import { messageFallback, onIntlError } from './fallback'
import { loadMessages } from './messages'

/**
 * next-intl request config (wired in next.config.ts). Pages take the locale from the app/[lang] root
 * param (`next/root-params`), not from request headers, so pages that are static today stay static.
 * Only app/global-not-found.tsx renders outside [lang] (no root param): it falls back to the locale
 * src/proxy.ts resolved from the URL (`requestLocale`, a request header), and to English without one.
 * Times are UTC, as everywhere on the site.
 */
export default getRequestConfig(async (params) => {
  // `params.requestLocale` is a getter that reads request headers: touch it only without a root param
  // (destructuring it would make every page dynamic).
  const requested = (await lang()) ?? (await params.requestLocale)
  const locale = requested && isLocale(requested) ? requested : defaultLocale
  return {
    locale,
    messages: await loadMessages(locale),
    timeZone: 'UTC',
    onError: onIntlError,
    getMessageFallback: messageFallback,
  }
})
