import type { Metadata, Viewport } from 'next'
import { Barlow_Condensed, Inter } from 'next/font/google'
import type { ReactNode } from 'react'
import { CommandPaletteProvider } from '@/components/layout/command/CommandPaletteProvider'
import { Footer } from '@/components/layout/Footer'
import { SiteHeader } from '@/components/layout/header/SiteHeader'
import { SkipLink } from '@/components/layout/SkipLink'
import './globals.css'

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

export const metadata: Metadata = {
  title: {
    default: 'Deadlockprohunger — Deadlock analytics & strategy',
    template: 'Deadlockprohunger — %s',
  },
  description:
    'Unofficial community analytics and strategy for Deadlock. Data, insight, decision, action.',
}

export const viewport: Viewport = {
  themeColor: '#0b1220',
  colorScheme: 'dark',
  viewportFit: 'cover', // enables env(safe-area-inset-*) on notched phones
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${displaySlant.variable} ${ui.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <SkipLink />
        <CommandPaletteProvider>
          <SiteHeader />
          <main id="content" tabIndex={-1} className="flex-1 focus:outline-none">
            {children}
          </main>
          <Footer />
        </CommandPaletteProvider>
      </body>
    </html>
  )
}
