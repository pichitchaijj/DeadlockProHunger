import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'
import en from '@/i18n/messages/en'
import { boardNoteText, type BoardNote } from '@/features/leaderboard/model'
import { REGIONS, SCOREBOARD_METRICS, type ScoreboardMetric } from '@/lib/deadlock/constants'

/*
 * The Leaderboard page words its prose from the catalog (leaderboard.*). These checks pin the English catalog
 * to the exact sentences the page produced before localization (templates copied from the pre-localization
 * loader and components), so the English output can't drift.
 */

const t = createTranslator({ locale: 'en', messages: en, namespace: 'leaderboard' })
const notes = (key: string, values?: Record<string, string | number>) => t(`notes.${key}` as 'notes.saved', values)
const savedTime = (ms: number) => new Date(ms).toUTCString().slice(5, 22)

/** The pre-localization note (features/leaderboard/loaders.ts) plus the page's win-rate caution. */
function oldNote(n: BoardNote, caution: boolean): string {
  let text: string
  if (n.kind === 'regional') {
    const savedAt = n.savedAt === null ? null : new Date(n.savedAt)
    text = `${savedAt ? `The live leaderboard didn’t respond, so this is the copy saved ${savedAt.toUTCString().slice(5, 22)} UTC. ` : ''}Valve’s ${n.hero ? `${n.hero} ` : ''}leaderboard (updated hourly): ${n.shown} of the top ${n.top} entries shown.${n.ambiguous ? ` ${n.ambiguous} entries match several possible accounts, so they aren’t linked and have no current rank.` : ''}`
  } else if (n.kind === 'global') {
    text = `Global: players with ${n.minMatches}+ tracked matches${n.hero ? ` on ${n.hero}` : ''} in the last 30 days, ordered by rank progress from their ranked matches. Built from tracked match data, not Valve’s regional lists.`
  } else {
    text = `Players with ${n.minMatches}+ tracked matches${n.hero ? ` on ${n.hero}` : ''} in the last ${n.days} days. Built from tracked match data; all regions.`
  }
  return text + (caution ? ' Top win rates over few matches are often luck; check each player’s sample and interval.' : '')
}

describe('Leaderboard English wording', () => {
  it('keeps the data-basis note for every branch', () => {
    const cases: BoardNote[] = [
      { kind: 'regional', savedAt: null, hero: null, shown: 200, top: 200, ambiguous: 0 },
      { kind: 'regional', savedAt: null, hero: 'Lady Geist', shown: 37, top: 200, ambiguous: 12 },
      { kind: 'regional', savedAt: Date.UTC(2026, 9, 8, 14, 5), hero: null, shown: 150, top: 200, ambiguous: 1 },
      { kind: 'global', minMatches: 20, hero: null },
      { kind: 'global', minMatches: 20, hero: 'Mo & Krill' },
      { kind: 'performance', minMatches: 50, hero: null, days: 30 },
      { kind: 'performance', minMatches: 100, hero: 'Abrams', days: 7 },
    ]
    for (const n of cases) {
      for (const caution of [false, true]) expect(boardNoteText(n, notes, savedTime, caution)).toBe(oldNote(n, caution))
    }
  })

  it('keeps the rank-change title', () => {
    const old = (time: string, up: boolean, delta: string, move: 'up' | 'down' | null) =>
      `Latest ranked match ${time}: ${up ? '+' : '−'}${delta} rank progress${move ? (move === 'up' ? ', promoted' : ', demoted') : ''}`
    for (const [up, move] of [[true, null], [true, 'up'], [false, 'down'], [false, null]] as const) {
      expect(t('change.title', { time: '3h ago', delta: `${up ? '+' : '−'}1,410`, move: move ?? 'none' })).toBe(old('3h ago', up, '1,410', move))
    }
  })

  it('keeps the labels the page used to hard-code', () => {
    for (const m of Object.keys(SCOREBOARD_METRICS) as ScoreboardMetric[]) expect(t(`metrics.${m}`)).toBe(SCOREBOARD_METRICS[m].label)
    for (const [id, label] of REGIONS) expect(t(`filters.regions.${id}`)).toBe(label)
    expect(t('filters.minOption', { count: 50 })).toBe('50+')
    expect(t('filters.days', { count: 7 })).toBe('7 days')
    expect(t('board.matchCount', { count: '1,234' })).toBe('1,234 matches')
    expect(t('board.possibleAccounts', { count: 3 })).toBe('3 possible accounts, not linked')
  })
})
