import { createTranslator } from 'next-intl'
import en from '@/i18n/messages/en'
import type { Insight, PurchasePhaseKey } from '@/lib/analytics/insights'
import { insightText, type InsightFormat, type InsightText } from '@/lib/analytics/insightText'
import { formatInteger, formatPercent, formatPointDelta } from '@/lib/format'
import { englishScope } from './scopeEnglish'

/* The Insight Engine's English wording for tests: the same catalog and formatters the pages use for English. */

const t = createTranslator({ locale: 'en', messages: en, namespace: 'insights' })
const sample = createTranslator({ locale: 'en', messages: en, namespace: 'data.sample' })
const lengths = createTranslator({ locale: 'en', messages: en, namespace: 'heroes.parts.lengths' })
const phases = createTranslator({ locale: 'en', messages: en, namespace: 'items.phases' })
const PHASE_KEYS = { early: 'early', mid: 'mid', late: 'late', 'very-late': 'veryLate' } as const satisfies Record<PurchasePhaseKey, string>

export const englishFormat: InsightFormat = {
  percent: (v) => formatPercent(v),
  delta: (v) => formatPointDelta(v),
  integer: (v) => formatInteger(v, 'en'),
  sample: (tier) => sample(tier),
  length: (key) => lengths(key as 'short'),
  phase: (key) => ({ label: phases(PHASE_KEYS[key]), range: phases(`${PHASE_KEYS[key]}Range`) }),
  scope: (s) => englishScope.scope(s),
}

/** An insight in English, as the pages show it. */
export const english = (insight: Insight): InsightText => insightText(insight, (key, values) => t(key as 'card.why', values), englishFormat)

/** The English `insights` catalog translator. */
export const insightsT = t
