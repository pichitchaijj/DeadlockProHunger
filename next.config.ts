import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

/**
 * Security headers on every response (docs/QA.md § Security). The CSP only uses directives that
 * can't break rendering: no framing (clickjacking), no plugins, base URI and form targets pinned to
 * our origin. A script-src policy needs per-request nonces with the App Router (open item).
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
]

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // The root layout is under app/[lang] (locale routing), so the 404 for unmatched URLs needs its own
    // document: app/global-not-found.tsx. Without it Next renders a bare, unstyled, language-less 404.
    globalNotFound: true,
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

// next-intl: points getTranslations & co. at the request config (locale from the app/[lang] segment).
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

export default withNextIntl(nextConfig)
