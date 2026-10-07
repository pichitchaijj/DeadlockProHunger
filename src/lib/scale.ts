/**
 * Win-rate bar scale centered on 50%: at least 40–60%, widened in 5-point steps so no value
 * (or interval end) is clipped. Keeping 50% centered makes above/below-average readable at a glance.
 */
export function winRateDomain(values: number[]): { min: number; max: number } {
  const furthest = Math.max(0.1, ...values.filter(Number.isFinite).map((v) => Math.abs(v - 0.5) + 0.01))
  const half = Math.min(0.5, Math.ceil(furthest * 20) / 20)
  return { min: 0.5 - half, max: 0.5 + half }
}

/** Position of `value` within the domain as a 0–100 percentage, clamped. */
export function toPercent(value: number, domain: { min: number; max: number }): number {
  return Math.min(100, Math.max(0, ((value - domain.min) / (domain.max - domain.min)) * 100))
}

export function domainLabel(domain: { min: number; max: number }): string {
  return `${Math.round(domain.min * 100)}–${Math.round(domain.max * 100)}%`
}
