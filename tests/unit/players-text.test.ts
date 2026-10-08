import { createTranslator } from 'next-intl'
import { describe, expect, it } from 'vitest'
import en from '@/i18n/messages/en'

/*
 * The Players pages word their prose from the catalog (players.*). These checks pin the English catalog
 * to the exact sentences the components produced before localization (templates copied from the
 * pre-localization code), so the English output can't drift.
 */

const t = createTranslator({ locale: 'en', messages: en, namespace: 'players' })

/** The pre-localization data-basis line (app/[lang]/players/[accountId]/page.tsx). */
function oldSummary(counted: string, firstAt: string | null, excluded: number) {
  return `Based on ${counted} normal-mode matches stored by the data source${firstAt ? ` since ${firstAt}` : ''}${
    excluded > 0 ? `; ${excluded} ${excluded === 1 ? 'match' : 'matches'} with a penalized or not-scored outcome ${excluded === 1 ? 'isn’t' : 'aren’t'} counted in win rates` : ''
  }. History may be incomplete. These are results, not a skill rating.`
}

function newSummary(counted: string, firstAt: string | null, excluded: number) {
  return t('profile.summary', {
    basis: firstAt ? t('profile.basisSince', { counted, date: firstAt }) : t('profile.basis', { counted }),
    excluded: excluded > 0 ? t('profile.excluded', { count: excluded }) : '',
  })
}

describe('Players English wording', () => {
  it('keeps the data-basis sentence for every branch (since date, 0 / 1 / many excluded)', () => {
    for (const [firstAt, excluded] of [[null, 0], ['Sep 29, 2026', 0], ['Sep 29, 2026', 1], [null, 3], ['Jan 2, 2025', 12]] as const) {
      expect(newSummary('1,234', firstAt, excluded)).toBe(oldSummary('1,234', firstAt, excluded))
    }
  })

  it('keeps the trend verdicts', () => {
    expect(t('trend.changed', { direction: 'higher' })).toBe('The latest block is clearly higher than the one before (intervals don’t overlap).')
    expect(t('trend.changed', { direction: 'lower' })).toBe('The latest block is clearly lower than the one before (intervals don’t overlap).')
    expect(t('trend.noChange')).toBe('The latest block isn’t clearly different from the one before.')
    expect(t('trend.tooFew', { count: 20 })).toBe('Fewer than 20 counted matches, so there is no trend to show.')
    expect(t('trend.legend', { count: 20, scale: '40%–60%' })).toBe('Each bar is 20 consecutive matches (oldest left, newest highlighted). Scale 40%–60%; dashed line 50%; whisker = 95% interval.')
  })

  it('keeps the per-block and rank-history sentences', () => {
    const v = { from: 'Sep 1, 2026', to: 'Sep 9, 2026', rate: '55.0%', wins: 11, matches: 20 }
    expect(t('trend.blockTitle', v)).toBe(`${v.from} – ${v.to}: ${v.rate} (${v.wins}/${v.matches})`)
    expect(t('trend.block', { ...v, n: 3 })).toBe(`Block 3, ${v.from} to ${v.to}: ${v.rate} over ${v.matches} matches.`)
    const r = { first: 'Oracle II', last: 'Phantom IV', count: 42 }
    expect(t('rankHistory.chart', r)).toBe(`Rank went from ${r.first} to ${r.last} over the last ${r.count} ranked matches.`)
    expect(t('rankHistory.caption', { ...r, from: v.from, to: v.to })).toBe(`${r.first} → ${r.last} across the last ${r.count} ranked matches with a reported rank (${v.from} – ${v.to}).`)
  })

  it('keeps the short data lines, with names and ids passed through unchanged', () => {
    expect(t('fallbackName', { id: 1606031955 })).toBe('Player 1606031955')
    expect(t('profile.winsOf', { wins: '11', matches: '20' })).toBe('11 wins of 20')
    expect(t('list.matches30d', { count: '57' })).toBe('57 matches in 30 days')
    expect(t('profile.afterLatest', { date: 'Oct 7, 2026' })).toBe('after their latest ranked match (Oct 7, 2026)')
    expect(t('profile.placements', { count: 4 })).toBe('In placement matches (4 left)')
    expect(t('pool.kda', { kda: '7.1 / 5.0 / 9.3' })).toBe('K/D/A 7.1 / 5.0 / 9.3')
  })
})
