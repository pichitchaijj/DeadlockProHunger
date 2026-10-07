/**
 * Patch dates from the /v2/patches feed.
 * Verified 2026-10-06: forum `pub_date` is unreliable (several changelog posts share one
 * republish timestamp), but forum titles carry the patch date as MM-DD-YYYY
 * (e.g. "09-29-2026", "09-16-2026 Update"). The title date wins; pub_date is the fallback.
 */
const TITLE_DATE = /\b(\d{2})-(\d{2})-(\d{4})\b/

/** Unix ms at 00:00 UTC of the date in the title, or null. */
export function patchDateFromTitle(title: string): number | null {
  const match = TITLE_DATE.exec(title)
  if (!match) return null
  const [, mm, dd, yyyy] = match
  const time = Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd))
  const date = new Date(time)
  // Reject impossible dates like 13-40-2026 that Date.UTC would roll over.
  if (date.getUTCMonth() !== Number(mm) - 1 || date.getUTCDate() !== Number(dd)) return null
  return time
}
