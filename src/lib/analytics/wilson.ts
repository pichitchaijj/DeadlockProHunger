export type Interval = { low: number; high: number }

/** 95% Wilson score interval for a proportion (wins / matches). */
export function wilsonInterval(wins: number, matches: number, z = 1.96): Interval {
  if (matches <= 0) return { low: 0, high: 1 }
  const p = wins / matches
  const z2 = z * z
  const denominator = 1 + z2 / matches
  const center = (p + z2 / (2 * matches)) / denominator
  const margin = (z * Math.sqrt((p * (1 - p)) / matches + z2 / (4 * matches * matches))) / denominator
  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin) }
}
