import { IntlErrorCode, type IntlError } from 'next-intl'

/*
 * What happens when a message can't be resolved. Catalogs are complete (typed against English, tested)
 * and every locale is merged over English (./merge.ts), so this is a last line of defence.
 */

/** Logs the failure; a missing key means it is missing in English too. */
export function onIntlError(error: IntlError) {
  if (error.code === IntlErrorCode.MISSING_MESSAGE) console.error(`[i18n] ${error.message}`)
  else console.error('[i18n]', error)
}

/** Never show a raw key ("nav.links.heroes") to users: render nothing instead. */
export function messageFallback(): string {
  return ''
}
