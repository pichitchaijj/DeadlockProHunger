import { defaultLocale, locales } from '../../i18n/config'
import { DRAFT_PARAMS } from './query'

/*
 * Routing for the cached empty Draft board (used by next.config.ts, so relative imports only). Pure.
 *
 * - Rewrite: `/{lang}/draft` with none of DRAFT_PARAMS → `/{lang}/draft/board` (ISR). It runs after the proxy,
 *   so English `/draft` arrives as `/en/draft` and miscased or `/en/…` URLs have already been redirected by
 *   next-intl. The URL in the address bar stays `/draft`; Next's own `_rsc` parameter is not a Draft parameter.
 * - Redirect: the board path requested directly goes to the clean Draft URL, so it never becomes a second
 *   address for the same page. Redirects only see incoming URLs, never the rewrite above.
 */

const prefixed = locales.filter((l) => l !== defaultLocale)
const anyLocale = `:lang(${locales.join('|')})`

/** The cached board's app path. Never a public URL: its public address is `/draft`. */
export const DRAFT_BOARD_PATH = '/draft/board'

/**
 * The public app path for an app path. A prerendered page reached through a rewrite sees its own path in
 * `usePathname()` while rendering on the server, and the browser path on the client; components that build
 * links from the pathname (the language switcher) map it here so both agree.
 */
export function publicAppPath(path: string): string {
  return path === DRAFT_BOARD_PATH ? '/draft' : path
}

export function draftRewrites() {
  return [
    {
      source: `/${anyLocale}/draft`,
      destination: `/:lang${DRAFT_BOARD_PATH}`,
      missing: DRAFT_PARAMS.map((key) => ({ type: 'query' as const, key })),
    },
  ]
}

export function draftRedirects() {
  return [
    { source: DRAFT_BOARD_PATH, destination: '/draft', permanent: false },
    { source: `/${defaultLocale}${DRAFT_BOARD_PATH}`, destination: '/draft', permanent: false },
    { source: `/:lang(${prefixed.join('|')})${DRAFT_BOARD_PATH}`, destination: '/:lang/draft', permanent: false },
  ]
}
