import type { useTranslations } from 'next-intl'
import { formatCompact, formatDuration } from '@/lib/format'
import type { EventDetail, Side, StoryPhase } from './model'

/*
 * Match Detail wording in the active locale (matches.*), built from the model's structured fields.
 * Hero and item names are game data and pass through unchanged; only the sentence around them is UI text.
 * The model keeps its English `text` / `facts` for other callers and tests.
 */

export type MatchesT = ReturnType<typeof useTranslations<'matches'>>

export const teamName = (t: MatchesT, side: Side) => t('common.team', { n: side + 1 })

/** The objective enum, worded (same ranges as model.objectiveName). */
export function objectiveText(t: MatchesT, id: number): string {
  if (id === 0) return t('events.objectives.core')
  if (id >= 1 && id <= 4) return t('events.objectives.tier1', { lane: id })
  if (id >= 5 && id <= 8) return t('events.objectives.tier2', { lane: id - 4 })
  if (id === 9) return t('events.objectives.titan')
  if (id === 10 || id === 11) return t('events.objectives.shield', { n: id - 9 })
  if (id >= 12 && id <= 15) return t('events.objectives.barracks', { lane: id - 11 })
  return t('events.objectives.other')
}

export function eventText(t: MatchesT, detail: EventDetail): string {
  switch (detail.type) {
    case 'kill':
      return detail.killer ? t('events.kill', { killer: detail.killer, victim: detail.victim }) : t('events.died', { victim: detail.victim })
    case 'objective':
      return t('events.objective', { team: teamName(t, detail.team), owner: teamName(t, detail.owner), objective: objectiveText(t, detail.objective) })
    case 'midboss':
      return detail.killed === detail.claimed
        ? t('events.bossClaimed', { team: teamName(t, detail.killed) })
        : t('events.bossSplit', { killed: teamName(t, detail.killed), claimed: teamName(t, detail.claimed) })
    case 'purchase':
      return t('events.bought', { hero: detail.hero, item: detail.item ?? t('events.anItem') })
  }
}

/** "even" or "Team 1 +3K" for a souls lead (Team 1 minus Team 2). */
export function leadText(t: MatchesT, value: number, locale?: Parameters<typeof formatCompact>[1]): string {
  if (value === 0) return t('common.even')
  return t('common.lead', { team: teamName(t, value > 0 ? 0 : 1), value: formatCompact(Math.abs(value), locale) })
}

/** The story phase's facts, worded from its fields (same facts and order as model.matchStory). */
export function storyFacts(t: MatchesT, phase: StoryPhase, locale?: Parameters<typeof formatCompact>[1]): string[] {
  const facts = [t('story.kills', { team1: teamName(t, 0), a: phase.kills[0], team2: teamName(t, 1), b: phase.kills[1] })]
  const sides = ([0, 1] as const).filter((s) => phase.objectiveIds[s].length > 0)
  facts.push(
    sides.length
      ? t('story.objectives', {
          list: sides.map((s) => t('story.objectiveSide', { team: teamName(t, s), count: phase.objectiveIds[s].length, names: phase.objectiveIds[s].map((id) => objectiveText(t, id)).join(', ') })).join('; '),
        })
      : t('story.noObjectives'),
  )
  if (phase.boss) facts.push(t('story.boss', { event: eventText(t, { type: 'midboss', killed: phase.boss.killed, claimed: phase.boss.claimed }), time: formatDuration(phase.boss.t) }))
  const change = phase.leadEnd - phase.leadStart
  const lead = { start: leadText(t, phase.leadStart, locale), startTime: formatDuration(phase.leadStartT), end: leadText(t, phase.leadEnd, locale), endTime: formatDuration(phase.leadEndT) }
  facts.push(change === 0 ? t('story.lead', lead) : t('story.leadGain', { ...lead, team: teamName(t, change > 0 ? 0 : 1), value: formatCompact(Math.abs(change), locale) }))
  return facts
}
