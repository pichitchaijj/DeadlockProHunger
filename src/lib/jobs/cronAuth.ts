import { timingSafeEqual } from 'node:crypto'

/**
 * Cron authorization: `Authorization: Bearer <CRON_SECRET>` (what Vercel Cron sends, and what the
 * GitHub Actions prewarm workflow sends). Without a configured secret every request is refused, so a
 * missing environment variable can never open the endpoint. Constant-time comparison.
 */
export function isCronAuthorized(authorization: string | null, secret: string | undefined): boolean {
  if (!secret) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const given = Buffer.from(authorization ?? '')
  return given.length === expected.length && timingSafeEqual(given, expected)
}
