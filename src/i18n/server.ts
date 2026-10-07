import 'server-only'
import { getLocale } from 'next-intl/server'
import { getPathname } from './navigation'

/**
 * An app path in the active locale, for Server Components that need a URL string rather than a Link
 * (GET form actions): '/players' → '/th/players' on Thai pages, '/players' in English.
 */
export async function localePath(href: string): Promise<string> {
  return getPathname({ href, locale: await getLocale() })
}
