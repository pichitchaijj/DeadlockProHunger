import type { MetadataRoute } from 'next'

/** Public pages are indexable; the internal design showcase (demo data) and API routes are not. */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', allow: '/', disallow: ['/design', '/api/'] }] }
}
