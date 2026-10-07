import type { Metadata, Viewport } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { Barlow_Condensed, Inter } from 'next/font/google'
import type { ReactNode } from 'react'
import type { Locale } from '@/i18n/config'
import { loadMessages } from '@/i18n/messages'
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
 * NextIntlClientProvider gives client components the active locale (locale-aware links in the header,
 * menus and pages: src/i18n/navigation.ts). It carries only the messages client components read
 * (Common, Errors for error.tsx); everything else is translated on the server.
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

export const siteMetadata: Metadata = {
  title: {
    default: 'Deadlockprohunger — Deadlock analytics & strategy',
    template: 'Deadlockprohunger — %s',
  },
  description:
    'Unofficial community analytics and strategy for Deadlock. Data, insight, decision, action.',
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
        <NextIntlClientProvider locale={lang} messages={{ Common: messages.Common, Errors: messages.Errors }}>
          <SkipLink />
          <CommandPaletteProvider>
            <SiteHeader />
            <main id="content" tabIndex={-1} className="flex-1 focus:outline-none">
              {children}
            </main>
            <Footer />
          </CommandPaletteProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
