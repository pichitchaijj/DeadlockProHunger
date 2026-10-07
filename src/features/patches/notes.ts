import { direction, parseValue, type Direction } from './direction'

/*
 * Official patch notes (pure). Steam "Minor Update - MM-DD-YYYY" posts in /v2/patches carry the full notes
 * as HTML paragraphs, one change per line, e.g. "- Rat King: Rat Swarm - Base Cooldown reduced from 28s to 24s".
 * Forum changelog entries carry only a link preview, so their notes aren't available here.
 * A line's before → after is shown only when the line itself states "from X to Y".
 */

export type NoteKind = 'hero' | 'item' | 'general'

export type NoteLine = {
  text: string
  /** Section header the line sits under, e.g. "Items", or null. */
  section: string | null
  kind: NoteKind
  /** Hero or item name, as matched against the current hero / shop lists. */
  subject: string | null
  /** Ability or "Gun" for hero lines written "Hero: Ability - change". */
  component: string | null
  /** The changed property, e.g. "Base Cooldown" (only for "from X to Y" lines). */
  property: string | null
  before: string | null
  after: string | null
  direction: Direction
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }

/** HTML → plain lines (paragraphs, list items and line breaks each start a line). */
export function noteLinesFromHtml(html: string): string[] {
  return html
    .replace(/<\s*(br|\/p|\/li|\/div|\/h\d)[^>]*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#?\w+);/g, (m, e: string) => ENTITIES[e.toLowerCase()] ?? (e.startsWith('#') ? String.fromCharCode(Number(e.slice(1))) : m))
    .split('\n')
    .map((l) => l.replace(/^\s*[-•*]\s*/, '').trim())
    .filter(Boolean)
}

const SECTION = /^\\?\[\s*([^\]]+?)\s*\]$/
const FROM_TO = /^(.*?)\s+(?:increased|reduced|decreased|lowered|raised|changed|adjusted|buffed|nerfed)?\s*from\s+([+-]?[\d.]+\s*[%a-z]*(?:\s*[-–]\s*[\d.]+\s*[%a-z]*)?)\s+to\s+([+-]?[\d.]+\s*[%a-z]*(?:\s*[-–]\s*[\d.]+\s*[%a-z]*)?)/i

/**
 * Classifies each note line. `heroes` / `items` are the names to recognize as subjects (case-insensitive).
 */
export function parseNotes(html: string, heroes: string[], items: string[]): NoteLine[] {
  const heroSet = new Map(heroes.map((h) => [h.toLowerCase(), h]))
  const itemSet = new Map(items.map((i) => [i.toLowerCase(), i]))
  let section: string | null = null
  const out: NoteLine[] = []

  for (const text of noteLinesFromHtml(html)) {
    const header = SECTION.exec(text)
    if (header) {
      section = header[1]
      continue
    }
    const colon = /^([^:]{2,40}):\s*(.+)$/.exec(text)
    const subjectKey = colon?.[1].trim().toLowerCase()
    const hero = subjectKey ? heroSet.get(subjectKey) : undefined
    const item = !hero && subjectKey ? itemSet.get(subjectKey) : undefined
    const kind: NoteKind = hero ? 'hero' : item ? 'item' : 'general'
    let rest = kind === 'general' ? text : colon![2]

    let component: string | null = null
    if (hero) {
      const dash = /^(.{2,40}?)\s+-\s+(.+)$/.exec(rest)
      if (dash) {
        component = dash[1].trim()
        rest = dash[2]
      }
    }

    const m = FROM_TO.exec(rest)
    const property = m ? m[1].trim().replace(/\s+(?:is|are|now)$/i, '') || null : null
    const before = m ? m[2].trim() : null
    const after = m ? m[3].trim() : null
    const single = (v: string | null) => (v && !/[-–]\s*[\d.]/.test(v.slice(1)) ? parseValue(v.replace(/\s+/g, '')).n : null)
    out.push({
      text,
      section,
      kind,
      subject: hero ?? item ?? null,
      component,
      property,
      before,
      after,
      direction: property ? direction(property, single(before), single(after)) : 'changed',
    })
  }
  return out
}
