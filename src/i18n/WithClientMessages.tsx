import { getLocale } from 'next-intl/server'
import type { ReactNode } from 'react'
import { IntlClientProvider } from './IntlClientProvider'
import { pickMessages } from './merge'
import { clientMessages, loadMessages } from './messages'

/**
 * Gives one client subtree extra messages beyond CLIENT_NAMESPACES (e.g. the Heroes directory's
 * filters and counts, which are computed in the browser). Only the listed paths, for the active locale,
 * are sent, and only on pages that render this; everything else keeps the site-wide client set.
 */
export async function WithClientMessages({ paths, children }: { paths: readonly string[]; children: ReactNode }) {
  const locale = await getLocale()
  const messages = await loadMessages(locale)
  return (
    <IntlClientProvider locale={locale} messages={{ ...clientMessages(messages), ...pickMessages(messages, paths) }}>
      {children}
    </IntlClientProvider>
  )
}
