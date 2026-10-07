import type { Metadata, Viewport } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { SiteDocument, siteMetadata, siteViewport } from '@/components/layout/SiteDocument'
import NotFound from './[lang]/not-found'
import './globals.css'

/*
 * The 404 for URLs no route matches (/does-not-exist, /th/does-not-exist). The root layout lives under
 * app/[lang], so Next's own /_not-found route has no layout of ours to render inside; this file is
 * that route's full document. It renders on the server like any page, in the URL's locale (src/proxy.ts
 * passes it on; src/i18n/request.ts). Pages that call notFound() still use app/[lang]/not-found.tsx.
 * Needs `experimental.globalNotFound` (next.config.ts).
 */

export const viewport: Viewport = siteViewport

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('notFound')
  return { ...siteMetadata, title: `Deadlockprohunger — ${t('heading')}` }
}

export default async function GlobalNotFound() {
  return (
    <SiteDocument lang={await getLocale()}>
      <NotFound />
    </SiteDocument>
  )
}
