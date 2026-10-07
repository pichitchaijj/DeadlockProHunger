import type { Metadata, Viewport } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { isLocale, locales } from '@/i18n/config'
import { loadMessages } from '@/i18n/messages'
import { SiteDocument, siteMetadata, siteViewport } from '@/components/layout/SiteDocument'
import '../globals.css'

export const metadata: Metadata = siteMetadata
export const viewport: Viewport = siteViewport

/** One static shell per locale; pages that are static today (Home) stay static for each locale. */
export function generateStaticParams() {
  return locales.map((lang) => ({ lang }))
}

/**
 * Root layout for every page (src/i18n: English is served unprefixed through the proxy rewrite).
 * Only the messages client components need are sent to the browser (the route error boundary); server
 * components read the rest on the server.
 */
export default async function RootLayout({ children, params }: { children: ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!isLocale(lang)) notFound()
  const messages = await loadMessages(lang)

  return (
    <SiteDocument lang={lang}>
      <NextIntlClientProvider locale={lang} messages={{ Common: messages.Common, Errors: messages.Errors }}>
        {children}
      </NextIntlClientProvider>
    </SiteDocument>
  )
}
