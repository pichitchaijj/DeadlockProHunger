import { sampleTier } from './sampleTier'
import { wilsonInterval } from './wilson'

export type WinLoss = { wins: number; matches: number }

export type Trend = {
  direction: 'rising' | 'falling' | 'stable'
  /** Win-rate change, current minus previous (ratio). */
  delta: number
}

/**
 * Trend rule (docs/PRODUCT.md § Trends): a change is only a trend when the two
 * windows' 95% Wilson intervals do not overlap. Returns null when either
 * window is Low sample, because then no trend may be shown at all.
 */
export function trendBetween(current: WinLoss, previous: WinLoss): Trend | null {
  if (sampleTier(current.matches) === 'low' || sampleTier(previous.matches) === 'low') return null
  const cur = wilsonInterval(current.wins, current.matches)
  const prev = wilsonInterval(previous.wins, previous.matches)
  const delta = current.wins / current.matches - previous.wins / previous.matches
  if (cur.low > prev.high) return { direction: 'rising', delta }
  if (cur.high < prev.low) return { direction: 'falling', delta }
  return { direction: 'stable', delta }
}
