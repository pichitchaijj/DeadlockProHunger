import type { Metadata, Viewport } from 'next'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { isLocale, locales } from '@/i18n/config'
import { SiteDocument, siteMetadata, siteViewport } from '@/components/layout/SiteDocument'
import '../globals.css'

export const metadata: Metadata = siteMetadata
export const viewport: Viewport = siteViewport

/** One static shell per locale; pages that are static today (Home) stay static for each locale. */
export function generateStaticParams() {
  return locales.map((lang) => ({ lang }))
}

/** Root layout for every page (src/i18n: English is served unprefixed through the proxy rewrite). */
export default async function RootLayout({ children, params }: { children: ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!isLocale(lang)) notFound()
  return <SiteDocument lang={lang}>{children}</SiteDocument>
}
