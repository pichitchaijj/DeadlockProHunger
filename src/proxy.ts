import createMiddleware from 'next-intl/middleware'
import { routing } from '@/i18n/routing'

/**
 * Locale routing (src/i18n/routing.ts): rewrites unprefixed URLs to the English pages under app/[lang]
 * and keeps the query string. It never redirects on browser language.
 */
export default createMiddleware(routing)

export const config = {
  // Pages only: never API routes, Next internals, or files (robots.txt, icons, /brand/*.webp).
  matcher: ['/((?!api(?:/|$)|_next|_vercel|.*\\..*).*)'],
}
