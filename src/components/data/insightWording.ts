import 'server-only'
import { getLocale, getTranslations } from 'next-intl/server'
import type { Insight, PurchasePhaseKey } from '@/lib/analytics/insights'
import { insightText, type InsightFormat, type InsightText } from '@/lib/analytics/insightText'
import { formatInteger, formatPercent, formatPointDelta } from '@/lib/format'
import type { InsightCardLabels } from './InsightCard'
import { getScopeWording } from './scopeWording'

export type InsightWording = {
  /** An insight's text in the request's language. */
  text: (insight: Insight) => InsightText
  card: InsightCardLabels
  grid: { title: (hero: string, strong: boolean) => string; intro: (strong: boolean) => string; empty: string }
}

/** Catalog keys of the purchase phases (items.phases). */
const PHASE_KEYS = { early: 'early', mid: 'mid', late: 'late', 'very-late': 'veryLate' } as const satisfies Record<PurchasePhaseKey, string>

/**
 * The Insight Engine's wording for the current request: the `insights` catalog plus the shared labels it
 * reuses (data.sample tiers, heroes.parts.lengths, items.phases), with the locale's number formats.
 * Server-only and cheap (catalog reads, no data): the facts it words come from the caller's loaders.
 */
export async function getInsightWording(): Promise<InsightWording> {
  const [t, data, lengths, phases, locale, scope] = await Promise.all([
    getTranslations('insights'),
    getTranslations('data.sample'),
    getTranslations('heroes.parts.lengths'),
    getTranslations('items.phases'),
    getLocale(),
    getScopeWording(),
  ])
  const format: InsightFormat = {
    percent: (v) => formatPercent(v),
    delta: (v) => formatPointDelta(v),
    integer: (v) => formatInteger(v, locale),
    sample: (tier) => data(tier),
    length: (key) => lengths(key as 'short'),
    phase: (key) => ({ label: phases(PHASE_KEYS[key]), range: phases(`${PHASE_KEYS[key]}Range`) }),
    scope: (s) => scope.scope(s),
  }
  return {
    text: (insight) => insightText(insight, (key, values) => t(key as 'card.why', values), format),
    card: { why: t('card.why'), hideExplanation: t('card.hide'), rule: t('card.rule') },
    grid: {
      title: (hero, strong) => (strong ? t('grid.titleStrong', { hero }) : t('grid.title', { hero })),
      intro: (strong) => t('grid.intro', { strong: strong ? 'yes' : 'no' }),
      empty: t('grid.empty'),
    },
  }
}
