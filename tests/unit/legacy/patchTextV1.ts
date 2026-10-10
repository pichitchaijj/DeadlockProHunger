/*
 * Patch wording v1, kept verbatim as the English regression oracle for tests/unit/patches-text.test.ts:
 * the pre-localization constants of features/patches (indicators, model, direction, diff) and the English
 * templates of the Patch pages. Test-only: never import it from src/.
 */
import type { BadgeTone } from '@/components/ui/Badge'
import type { Mark, Verdict } from '@/features/patches/model'

// ── components/indicators.tsx ──
export const MARKS: Record<Mark, { tone: BadgeTone; icon: string; label: string }> = {
  buff: { tone: 'positive', icon: '▲', label: 'Buff' },
  nerf: { tone: 'negative', icon: '▼', label: 'Nerf' },
  changed: { tone: 'warning', icon: '●', label: 'Changed' },
  mixed: { tone: 'neutral', icon: '◆', label: 'Mixed' },
  new: { tone: 'primary', icon: '+', label: 'New' },
  removed: { tone: 'neutral', icon: '−', label: 'Removed' },
}

export const VERDICTS: Record<Verdict, { tone: BadgeTone; icon: string; label: string }> = {
  higher: { tone: 'positive', icon: '▲', label: 'Higher' },
  lower: { tone: 'negative', icon: '▼', label: 'Lower' },
  'no clear change': { tone: 'neutral', icon: '', label: 'No clear change' },
  'not enough data': { tone: 'neutral', icon: '', label: 'Not enough data' },
}

// ── model.ts / direction.ts ──
export const CLEAR_RULE = 'Both periods have 200+ matches, their 95% intervals don’t overlap, and the win rate moved at least 1 percentage point.'

export const DIRECTION_RULE =
  'Buff / nerf follows a fixed rule on the property and its values: lower cooldowns, costs, delays and penalties count as buffs; higher damage, health, healing, duration, radius, range, speed, slows and resists count as buffs. Anything else, or a change to or from zero, is shown as “changed”.'

// ── diff.ts ──
const UNITS_PER_METER = 39.37
export const WEAPON_FIELDS: Array<[string, string, string, number]> = [
  ['bullet_damage', 'Bullet damage', '', 1],
  ['bullets', 'Bullets per shot', '', 1],
  ['cycle_time', 'Fire interval', 's', 1],
  ['clip_size', 'Magazine size', '', 1],
  ['reload_duration', 'Reload time', 's', 1],
  ['damage_falloff_start_range', 'Falloff start range', 'm', UNITS_PER_METER],
  ['damage_falloff_end_range', 'Falloff end range', 'm', UNITS_PER_METER],
  ['crit_bonus_start', 'Headshot multiplier', '×', 1],
]

/** patchesFromFeed: link labels and the name of an unnamed patch; groupChanges: an unnamed hero. */
export const linkLabel = (source: 'forum' | 'steam') => (source === 'forum' ? 'Official changelog (forum)' : 'Steam news')
export const untitled = (isoDay: string) => `${isoDay} update`
export const unnamedHero = (id: number) => `Hero ${id}`
/** diff.ts: the cost label and value text, and the gun's name. */
export const COST_LABEL = 'Cost'
export const costText = (value: string) => `${value} souls`
export const GUN = 'Gun'

// ── Pages and components (templates) ──
const LIST_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const DETAIL_DATE = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const SHORT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const COMPARE_SHORT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const BUILD = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })
const DAY = 86_400
type Window = { from: number; to: number; days: number }

export const listDate = (day: number) => LIST_DATE.format(day * 1000)
export const latestEyebrow = (day: number) => `Latest patch · ${LIST_DATE.format(day * 1000)}`
export const counts = (c: { heroes: number; abilities: number; items: number }) => `${c.heroes} heroes · ${c.abilities} abilities · ${c.items} items (official notes)`
export const footnote = (n: number) =>
  `Patches come from the official changelog and Steam update posts in the data feed (${n} patches). Every patch page compares the game data of the builds around its date.`
export const detailEyebrow = (day: number) => `Patch · ${DETAIL_DATE.format(day * 1000)}`
export const detailMetadata = (title: string, day: number) => ({
  title: `${title} · Patch`,
  description: `What changed in the ${DETAIL_DATE.format(day * 1000)} Deadlock patch, and hero and item statistics before and after it.`,
})
export const buildLine = (from: { version: number; builtAt: number }, to: { version: number; builtAt: number }) =>
  `Game data: build ${from.version} (${BUILD.format(from.builtAt * 1000)} UTC) → build ${to.version} (${BUILD.format(to.builtAt * 1000)} UTC).`
export const showNotes = (n: number) => `Show the official notes (${n} lines)`
export const valueChanges = (source: string) => `value changes · ${source}`
export const noHeroes = (hero?: string) => `No hero values changed${hero ? ` for ${hero}` : ''}.`
export const noItems = (item?: string) => `No shop item values changed${item ? ` for ${item}` : ''}.`
export const detailWindow = (w: Window) => `${SHORT.format(w.from * 1000)}–${SHORT.format((w.to - DAY) * 1000)}`
export const impactLabels = (before: Window, after: Window) => ({ a: `Before (${detailWindow(before)})`, b: `After (${detailWindow(after)})` })
export const early = (days: number) => `Only ${days} ${days === 1 ? 'day' : 'days'} after the patch so far (the latest day is incomplete). Treat changes as early signals.`
export const compareWindow = (w: Window) => `${COMPARE_SHORT.format(w.from * 1000)}–${COMPARE_SHORT.format((w.to - DAY) * 1000)}`
export const compareLabels = (olderId: string, older: Window, newerId: string, newer: Window) => ({ a: `${olderId} (${compareWindow(older)})`, b: `${newerId} (${compareWindow(newer)})` })
export const compareEarly = (days: number) => `The newer patch has only ${days} ${days === 1 ? 'day' : 'days'} of data so far. Treat changes as early signals.`
export const versus = (a: string, b: string) => `${a} vs ${b}`
export const heroesDescription = (a: string, b: string) => `${a} → ${b}. Observed differences between the two periods, not effects of the patches.`
export const compareCaption = (kind: 'hero' | 'item', a: string, b: string) => (kind === 'hero' ? `Hero win and pick rates, ${a} vs ${b}` : `Item win and buy rates, ${a} vs ${b}`)
export const dataDescription = (from: number, to: number) => `Build ${from} → build ${to}: every value that differs, across all patches in between.`
export const impactFootnote = (a: string, b: string) => `${a} → ${b}. Changed-in-patch markers come from the game data.`
export const broadSummary = (n: number) => `Broad changes (${n}): the same value change on many entries`
export const entries = (n: number) => `on ${n} entries`
export const matchesAfter = (formatted: string) => `${formatted} matches after`
export const option = (id: string, title: string) => `${id} · ${title}`
export const itemTier = (tier: number) => `Tier ${tier}`
export const mostImpactedNote = `Heroes whose win rate moved beyond normal variation. ${CLEAR_RULE}`
export const howDirection = `Buff / nerf: ${DIRECTION_RULE}`
