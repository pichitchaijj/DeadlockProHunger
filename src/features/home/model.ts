import type { SampleTier } from '@/lib/analytics/sampleTier'

/*
 * Pure Home rules. Loaders fetch; this decides what can be said.
 */

/** A section's freshness budget: stale once the data is older than this (ms). */
export const FRESHNESS = {
  /** Upstream analytics refresh every ~6h; older than 12h means revalidation has been failing. */
  analytics: 12 * 60 * 60 * 1000,
  builds: 3 * 60 * 60 * 1000,
  matches: 60 * 60 * 1000,
  patches: 6 * 60 * 60 * 1000,
} as const

export function isStale(asOf: number, now: number, maxAgeMs: number): boolean {
  return now - asOf > maxAgeMs
}

/** Strips tags and decodes the few entities the forum uses. */
export function patchText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
}

export type PatchExcerpt = { headline: string; text: string }

/**
 * The feed carries only a link preview of each changelog post (a few hundred characters, cut
 * off by the source), not the notes. We show it as an excerpt; never count or summarize it.
 */
export function patchExcerpt(html: string, maxChars = 240): PatchExcerpt | null {
  const lines = patchText(html)
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  // Drop the preview's trailing domain line (e.g. "store.steampowered.com").
  const body = lines.filter((l) => !/^[\w.-]+\.(com|net|org)$/.test(l))
  if (body.length === 0) return null
  const headline = body[0].replace(/\s+-\s+Steam News$/i, '').trim()
  const rest = body.slice(1).join(' ')
  if (!rest) return { headline, text: '' }
  const space = rest.lastIndexOf(' ', maxChars)
  const cut = rest.length > maxChars ? rest.slice(0, space > 0 ? space : maxChars) : rest
  // Always marked as cut: the source preview itself is truncated.
  return { headline, text: `${cut}…` }
}

// ── Hero performance (top 5 per metric) ──────────────────────────────

export const PERFORMANCE_TOP = 5

type PerfHero = { id: number; slug: string; name: string; iconUrl: string | null; winRate: number; pickRate: number; matches: number; sample: SampleTier }

export type PerformanceRow = { slug: string; name: string; imageSrc?: string; value: number; matches: number }
export type BanRow = { slug: string; name: string; imageSrc?: string; bans: number; share: number }

export type HeroPerformance = {
  winRate: PerformanceRow[]
  pickRate: PerformanceRow[]
  /** Null when the ban source failed; `total` = all bans recorded in the window. */
  bans: { rows: BanRow[]; total: number } | null
}

const row = (h: PerfHero, value: number): PerformanceRow => ({ slug: h.slug, name: h.name, imageSrc: h.iconUrl ?? undefined, value, matches: h.matches })

/**
 * Top heroes by win rate and pick rate (Low-sample heroes never rank), and by recorded bans.
 * Bans are shown as counts and as a share of all recorded bans: the source reports no match total
 * for its ban data, so a ban *rate* would be invented.
 */
export function heroPerformance(heroes: PerfHero[], bans: Array<{ hero_id: number; bans: number }> | null): HeroPerformance {
  const ranked = heroes.filter((h) => h.sample !== 'low')
  const byId = new Map(heroes.map((h) => [h.id, h]))
  const total = bans ? bans.reduce((n, b) => n + b.bans, 0) : 0
  return {
    winRate: [...ranked].sort((a, b) => b.winRate - a.winRate).slice(0, PERFORMANCE_TOP).map((h) => row(h, h.winRate)),
    pickRate: [...ranked].sort((a, b) => b.pickRate - a.pickRate).slice(0, PERFORMANCE_TOP).map((h) => row(h, h.pickRate)),
    bans: bans
      ? {
          total,
          rows: bans
            .filter((b) => b.bans > 0 && byId.has(b.hero_id))
            .sort((a, b) => b.bans - a.bans)
            .slice(0, PERFORMANCE_TOP)
            .map((b) => {
              const h = byId.get(b.hero_id)!
              return { slug: h.slug, name: h.name, imageSrc: h.iconUrl ?? undefined, bans: b.bans, share: total > 0 ? b.bans / total : 0 }
            }),
        }
      : null,
  }
}
