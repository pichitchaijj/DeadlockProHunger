import { sampleTier } from './sampleTier'
import { wilsonInterval } from './wilson'

/**
 * Meta tiers, derived only from win rate and its 95% Wilson interval.
 * Pick rate does not affect tier. Low-sample heroes get no tier.
 *
 *   S  interval entirely above 52%   (clearly strong)
 *   A  interval entirely above 50%   (likely above average)
 *   B  interval includes 50%         (not distinguishable from average)
 *   C  interval entirely below 50%   (likely below average)
 */
export type Tier = 'S' | 'A' | 'B' | 'C'

export const TIER_ORDER: Tier[] = ['S', 'A', 'B', 'C']

export const TIER_RULES: Record<Tier, string> = {
  S: 'Win-rate interval entirely above 52%',
  A: 'Win-rate interval entirely above 50%',
  B: 'Win-rate interval includes 50%',
  C: 'Win-rate interval entirely below 50%',
}

export function tierFor(wins: number, matches: number): Tier | null {
  if (sampleTier(matches) === 'low') return null
  const { low, high } = wilsonInterval(wins, matches)
  if (low > 0.52) return 'S'
  if (low > 0.5) return 'A'
  if (high < 0.5) return 'C'
  return 'B'
}
