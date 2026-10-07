/*
 * Rank identity: the one place that turns a badge, tier number or rank name into what the UI shows
 * (name, subrank numeral, metal, emblem URL). Plain module: loaders, client components and tests import it.
 *
 * Source: /v1/assets/ranks (getRanks) → rankCatalog(), carried on the resolved scope as `ranks`.
 * Emblems are the per-tier `large_webp` / `large` images on the assets CDN. The per-subrank images
 * are rendered on demand by api.deadlock-api.com: using them would make every visitor's browser call
 * the API directly, so the subrank is shown as a numeral instead.
 * Components never see URLs they didn't get from here, so swapping the asset source (or
 * self-hosting the emblems) is a change to this file only.
 */

/** A badge is `tier * 10 + subrank` (subranks 1–6). */
const NUMERALS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'] as const

/**
 * Metal name per tier, from the rank announcement art (Initiate = Brick … Oracle = Diamond).
 * Not in the API; the top three tiers have none.
 */
export const RANK_METALS: Readonly<Record<number, string>> = {
  1: 'Brick',
  2: 'Stone',
  3: 'Iron',
  4: 'Bronze',
  5: 'Silver',
  6: 'Gold',
  7: 'Platinum',
  8: 'Diamond',
}

export type RankTier = { tier: number; name: string; metal: string | null; image: string | null }

/** Every known tier, ascending. A plain array so it can cross into client components. */
export type RankCatalog = readonly RankTier[]

export type RankDisplay = {
  /** Badge (`tier * 10 + subrank`) when resolved from one. */
  badge: number | null
  tier: number | null
  /** 1–6, null when not known (a tier on its own, or a name). */
  subrank: number | null
  /** Tier name, e.g. "Oracle". */
  name: string
  /** Name with subrank numeral, e.g. "Oracle IV". */
  label: string
  metal: string | null
  /** Emblem URL; null = render the original fallback. */
  src: string | null
  /** False when the catalog doesn't contain the tier (renamed, new, or the catalog failed to load). */
  known: boolean
}

type RankImages = { large?: string | null; large_webp?: string | null } | null | undefined

/** Tier emblem URL (assets CDN), WebP first. */
export const rankImageUrl = (images: RankImages) => images?.large_webp ?? images?.large ?? null

/** Catalog from the /v1/assets/ranks response. */
export function rankCatalog(ranks: ReadonlyArray<{ tier: number; name: string; images?: RankImages }>): RankCatalog {
  return [...ranks]
    .sort((a, b) => a.tier - b.tier)
    .map((r) => ({ tier: r.tier, name: r.name, metal: RANK_METALS[r.tier] ?? null, image: rankImageUrl(r.images) }))
}

function display(catalog: RankCatalog, tier: number, subrank: number | null, badge: number | null): RankDisplay {
  const entry = catalog.find((r) => r.tier === tier)
  const name = entry?.name ?? `Tier ${tier}`
  const numeral = subrank ? (NUMERALS[subrank] ?? '') : ''
  return {
    badge,
    tier,
    subrank: numeral ? subrank : null,
    name,
    label: numeral ? `${name} ${numeral}` : name,
    metal: entry?.metal ?? RANK_METALS[tier] ?? null,
    src: entry?.image ?? null,
    known: Boolean(entry),
  }
}

/** Rank for a badge; null for no rank (0, null, undefined). */
export function rankFromBadge(catalog: RankCatalog, badge: number | null | undefined): RankDisplay | null {
  if (!badge || badge < 0 || !Number.isFinite(badge)) return null
  return display(catalog, Math.floor(badge / 10), badge % 10, badge)
}

/**
 * Rank for a tier number or a name ("Oracle", or its metal "Diamond"; case-insensitive).
 * An unknown name keeps the given text with no emblem, so it still reads correctly.
 */
export function rankFromTier(catalog: RankCatalog, tier: number | string | null | undefined): RankDisplay | null {
  if (tier === null || tier === undefined || tier === '') return null
  if (typeof tier === 'number') return Number.isInteger(tier) && tier >= 0 ? display(catalog, tier, null, null) : null
  const key = tier.trim().toLowerCase()
  const entry = catalog.find((r) => r.name.toLowerCase() === key || r.metal?.toLowerCase() === key)
  if (entry) return display(catalog, entry.tier, null, null)
  const name = tier.trim()
  return { badge: null, tier: null, subrank: null, name, label: name, metal: null, src: null, known: false }
}

/** "Oracle IV" for a badge; null for no rank. Text-only sites (chart axes, sentences) use this. */
export function badgeLabel(badge: number | null | undefined, tierNames: ReadonlyMap<number, string>): string | null {
  if (!badge) return null
  const tier = Math.floor(badge / 10)
  return `${tierNames.get(tier) ?? `Tier ${tier}`} ${NUMERALS[badge % 10] ?? ''}`.trim()
}

/** First and last tier of a rank band, for its emblem pair; null for "all ranks". */
export function bandRanks(tiers: [number, number] | null, catalog: RankCatalog): [RankDisplay, RankDisplay] | null {
  if (!tiers) return null
  return [display(catalog, tiers[0], null, null), display(catalog, tiers[1], null, null)]
}
