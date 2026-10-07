/** Heroes per match in normal mode (6 vs 6). */
export const HEROES_PER_MATCH = 12

/**
 * Pick rate per hero from hero-stats alone: hero matches ÷ (Σ hero matches ÷ 12).
 * game-stats.total_matches is deliberately not used as the denominator: the two
 * endpoints count slightly different populations (docs/API.md § 4.5).
 */
export function pickRates(matchesByHero: Map<number, number>): Map<number, number> {
  let total = 0
  for (const matches of matchesByHero.values()) total += matches
  const estimatedMatches = total / HEROES_PER_MATCH
  const rates = new Map<number, number>()
  for (const [heroId, matches] of matchesByHero) {
    rates.set(heroId, estimatedMatches > 0 ? matches / estimatedMatches : 0)
  }
  return rates
}

/** Estimated number of distinct matches behind a hero-stats response. */
export function estimatedMatchCount(matchesByHero: Map<number, number>): number {
  let total = 0
  for (const matches of matchesByHero.values()) total += matches
  return Math.round(total / HEROES_PER_MATCH)
}
