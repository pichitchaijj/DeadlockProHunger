/*
 * Buff / nerf labels. A fixed, conservative rule on the property name and the two values, never a
 * judgment of the patch. Anything the rule doesn't recognize is "changed".
 *
 * - "…reduction" properties (Damage Reduction, Resist Reduction, Cooldown Reduction) are effects:
 *   a larger magnitude is stronger.
 * - Cooldowns, costs, delays, reload / fire interval, penalties: lower is stronger.
 * - Damage, health, healing, duration, radius, range, speed, slows, resist, ammo…: higher is stronger.
 * Magnitudes are compared (−8% → −7% resist reduction is weaker). A sign flip or a value from/to 0 is "changed".
 */
export type Direction = 'buff' | 'nerf' | 'changed'

export const DIRECTION_LABEL: Record<Direction, string> = { buff: 'Buff', nerf: 'Nerf', changed: 'Changed' }

export const DIRECTION_RULE =
  'Buff / nerf follows a fixed rule on the property and its values: lower cooldowns, costs, delays and penalties count as buffs; higher damage, health, healing, duration, radius, range, speed, slows and resists count as buffs. Anything else, or a change to or from zero, is shown as “changed”.'

const REDUCTION = /reduction\b/i
const LOWER_BETTER = /cooldown|\bcost\b|delay|cast time|charge time|windup|reload|fire interval|cycle time|penalty|spread|recoil|damage taken|respawn/i
const HIGHER_BETTER =
  /damage|health|\bhp\b|regen|heal|spirit power|weapon power|fire rate|duration|radius|range|lifesteal|speed|slow|resist|ammo|magazine|clip|bullets|pellet|bounty|shield|barrier|stun|charges|stacks|amp|stamina|distance|width|multiplier|souls/i

export function direction(property: string, before: number | null, after: number | null): Direction {
  if (before === null || after === null || !Number.isFinite(before) || !Number.isFinite(after)) return 'changed'
  if (before === 0 || after === 0 || Math.sign(before) !== Math.sign(after)) return 'changed'
  const b = Math.abs(before)
  const a = Math.abs(after)
  if (a === b) return 'changed'
  const larger = a > b
  if (REDUCTION.test(property)) return larger ? 'buff' : 'nerf'
  if (LOWER_BETTER.test(property)) return larger ? 'nerf' : 'buff'
  if (HIGHER_BETTER.test(property)) return larger ? 'buff' : 'nerf'
  return 'changed'
}

/** "6.5m" → { n: 6.5, unit: "m" }; "-8.0" → { n: -8, unit: "" }; non-numeric → n null. */
export function parseValue(raw: string | number | null | undefined): { n: number | null; unit: string } {
  if (raw === null || raw === undefined) return { n: null, unit: '' }
  if (typeof raw === 'number') return { n: raw, unit: '' }
  const m = /^\s*([+-]?\d+(?:\.\d+)?)\s*([a-z%/]*)\s*$/i.exec(raw)
  return m ? { n: Number(m[1]), unit: m[2] } : { n: null, unit: '' }
}

/** Overall label for a group of changes: buff / nerf only when every labeled change agrees. */
export function overallDirection(directions: Direction[]): Direction | 'mixed' {
  const set = new Set(directions.filter((d) => d !== 'changed'))
  if (set.size === 0) return 'changed'
  if (set.size === 2) return 'mixed'
  return [...set][0]
}
