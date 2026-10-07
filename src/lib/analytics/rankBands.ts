/**
 * Rank-band presets for analytics filters.
 * A badge is `tier * 10 + subrank` (subranks 1–6); tiers 0–11 come from /v1/assets/ranks
 * (0 Obscurus … 11 Eternus). Bands filter matches by average badge
 * (`min_average_badge` / `max_average_badge`), not by individual player rank.
 */
export type RankBandId = 'all' | 'low' | 'mid' | 'high' | 'top'

export type RankBand = {
  id: RankBandId
  /** Inclusive tier range; null = no rank filter. */
  tiers: [number, number] | null
}

export const RANK_BANDS: RankBand[] = [
  { id: 'all', tiers: null },
  { id: 'low', tiers: [1, 4] }, // Initiate – Sentinel
  { id: 'mid', tiers: [5, 7] }, // Mystic – Emissary
  { id: 'high', tiers: [8, 9] }, // Oracle – Phantom
  { id: 'top', tiers: [10, 11] }, // Ascendant – Eternus
]

export function rankBand(id: string | undefined): RankBand {
  return RANK_BANDS.find((band) => band.id === id) ?? RANK_BANDS[0]
}

/** Badge range covering every subrank of the band's tiers. */
export function badgeRange(band: RankBand): { min: number; max: number } | null {
  if (!band.tiers) return null
  return { min: band.tiers[0] * 10 + 1, max: band.tiers[1] * 10 + 6 }
}

/** "Oracle – Phantom" from tier names; "All ranks" for no filter. */
export function rankBandLabel(band: RankBand, tierNames: Map<number, string>): string {
  if (!band.tiers) return 'All ranks'
  const [from, to] = band.tiers
  const a = tierNames.get(from) ?? `Tier ${from}`
  const b = tierNames.get(to) ?? `Tier ${to}`
  return from === to ? a : `${a} – ${b}`
}
