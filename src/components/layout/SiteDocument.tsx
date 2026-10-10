import type { Metadata, Viewport } from 'next'
import { Barlow_Condensed, Inter } from 'next/font/google'
import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'
import type { Locale } from '@/i18n/config'
import { siteUrl } from '@/i18n/seo'
import { IntlClientProvider } from '@/i18n/IntlClientProvider'
import { clientMessages, loadMessages } from '@/i18n/messages'
import { CommandPaletteProvider } from './command/CommandPaletteProvider'
import { Footer } from './Footer'
import { SiteHeader } from './header/SiteHeader'
import { SkipLink } from './SkipLink'

/*
 * The site's HTML document: fonts, <html lang>, and the shell (skip link, header, footer).
 * Shared by the root layout (app/[lang]/layout.tsx) and the 404 for unmatched URLs
 * (app/global-not-found.tsx), which renders outside every layout and so needs the same document.
 * Each route file imports globals.css itself.
 *
 * IntlClientProvider (next-intl) gives client components the active locale (locale-aware links in the header,
 * menus and pages: src/i18n/navigation.ts) and only the active locale's client namespaces
 * (CLIENT_NAMESPACES); everything else is translated on the server.
 */

const display = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-barlow-condensed',
  display: 'swap',
})

// Only `.type-slant` uses italic, at 800: one extra file instead of one per weight (docs/PERFORMANCE.md).
const displaySlant = Barlow_Condensed({
  subsets: ['latin'],
  weight: '800',
  style: 'italic',
  variable: '--font-barlow-condensed-italic',
  display: 'swap',
})

const ui = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

/**
 * Site-wide metadata defaults in the active locale (the Home catalog's title and description), the
 * production origin as `metadataBase` when SITE_URL is set (src/i18n/seo.ts), and the Google Search Console
 * ownership tag when GOOGLE_SITE_VERIFICATION is set (server-side; .env.example).
 */
export async function getSiteMetadata(): Promise<Metadata> {
  const t = await getTranslations('home.meta')
  const base = siteUrl()
  const google = process.env.GOOGLE_SITE_VERIFICATION?.trim()
  return {
    ...(base && { metadataBase: base }),
    title: { default: t('title'), template: 'Deadlockprohunger — %s' },
    description: t('description'),
    ...(google && { verification: { google } }),
  }
}

export const siteViewport: Viewport = {
  themeColor: '#0b1220',
  colorScheme: 'dark',
  viewportFit: 'cover', // enables env(safe-area-inset-*) on notched phones
}

export async function SiteDocument({ lang, children }: { lang: Locale; children: ReactNode }) {
  const messages = await loadMessages(lang)
  return (
    <html lang={lang} className={`${display.variable} ${displaySlant.variable} ${ui.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <IntlClientProvider locale={lang} messages={clientMessages(messages)}>
          <SkipLink />
          <CommandPaletteProvider>
            <SiteHeader />
            <main id="content" tabIndex={-1} className="flex-1 focus:outline-none">
              {children}
            </main>
            <Footer />
          </CommandPaletteProvider>
        </IntlClientProvider>
      </body>
    </html>
  )
}
