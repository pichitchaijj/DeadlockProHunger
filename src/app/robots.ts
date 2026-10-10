import type { MetadataRoute } from 'next'
import { robotsRules } from '@/i18n/seo'

/** Public pages are indexable; the internal design showcase (demo data) and API routes are not. */
export default function robots(): MetadataRoute.Robots {
  return robotsRules()
}
