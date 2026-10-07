/**
 * Sample-size tiers from docs/PRODUCT.md § Analytics strategy.
 * Starting thresholds; tune once real distributions are visible.
 */
export type SampleTier = 'low' | 'moderate' | 'high'

export const SAMPLE_TIER_THRESHOLDS = { moderate: 200, high: 1000 } as const

/**
 * Individual players have far fewer matches than population aggregates, so their stats use a
 * smaller scale. Starting thresholds; the 95% interval is always shown alongside.
 */
export const PLAYER_SAMPLE_THRESHOLDS = { moderate: 20, high: 100 } as const

export type SampleScale = 'population' | 'player'

export function sampleTier(matches: number, scale: SampleScale = 'population'): SampleTier {
  const t = scale === 'player' ? PLAYER_SAMPLE_THRESHOLDS : SAMPLE_TIER_THRESHOLDS
  if (matches > t.high) return 'high'
  if (matches >= t.moderate) return 'moderate'
  return 'low'
}

export const SAMPLE_TIER_LABEL: Record<SampleTier, string> = {
  low: 'Low sample',
  moderate: 'Moderate sample',
  high: 'High sample',
}
