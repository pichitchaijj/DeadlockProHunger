import type { Insight, Measured, PurchasePhaseKey, SplitGroup } from './insights'
import type { SampleTier } from './sampleTier'
import type { ScopeRef } from './scope'

/*
 * Insight Engine wording: an insight's facts (lib/analytics/insights.ts) → the text InsightCard shows, from
 * the catalog (insights.*). Pure: the caller passes the translator and formatters for its locale, so this
 * never reads a locale, a hook or the network, and the facts (numbers, ids, order) never depend on language.
 * With the English catalog and formatters the output matches the Insight Engine's original English exactly
 * (tests/unit/insights-text.test.ts).
 */

/** Reads the `insights` namespace. */
export type InsightTranslate = (key: string, values?: Record<string, string | number>) => string

export type InsightFormat = {
  /** Ratio → "54.2%". */
  percent: (ratio: number) => string
  /** Signed percentage-point change → "+2.4pp". */
  delta: (change: number) => string
  /** Count → "12,400" in the locale's grouping. */
  integer: (value: number) => string
  /** Sample tier → "High sample" (data.sample). */
  sample: (tier: SampleTier) => string
  /** Match-length group key (short / standard / long) → its label (heroes.parts.lengths). */
  length: (key: string) => string
  /** Purchase phase → its label and minute range (items.phases). */
  phase: (key: PurchasePhaseKey) => { label: string; range: string }
  /** The insight's scope → "Last 30 days, All ranks" (lib/analytics/scopeText). */
  scope: (scope: ScopeRef) => string
}

export type InsightMetricText = { id: string; label: string; value: string }

export type InsightText = {
  /** Short eyebrow, e.g. "Rising". */
  title: string
  /** The headline value, e.g. "+2.4pp" or "vs Haze". */
  value: string
  /** One descriptive sentence over the metrics. */
  statement: string
  /** The numbers the statement rests on (shown by "Why?"). */
  metrics: InsightMetricText[]
  /** The rule the insight passed. */
  rule: string
  /** Scope and sample note. */
  context: string
  caveat?: string
}

/** Percentage points without a sign, one decimal: 0.024 → "2.4". */
const points = (change: number) => Math.abs(change * 100).toFixed(1)
/** A purchase-phase lead (always positive), one decimal: 0.024 → "2.4". */
const lead = (gap: number) => (gap * 100).toFixed(1)

export function insightText(insight: Insight, t: InsightTranslate, f: InsightFormat): InsightText {
  const interval = (low: number, high: number) => t('metric.range', { low: f.percent(low), high: f.percent(high) })
  const wonInterval = (m: Measured) => t('metric.wonInterval', { rate: f.percent(m.winRate), count: f.integer(m.matches), range: interval(m.interval.low, m.interval.high) })
  const context = t('context.matches', { scope: f.scope(insight.scope), count: f.integer(insight.sampleSize), sample: f.sample(insight.sample) })

  switch (insight.kind) {
    case 'rising':
    case 'falling':
      return {
        title: t(`kinds.shift.${insight.kind}`),
        value: f.delta(insight.delta),
        statement: t('kinds.shift.statement', { subject: insight.subject, direction: insight.kind, points: points(insight.delta), previous: f.percent(insight.previous.winRate), current: f.percent(insight.current.winRate) }),
        metrics: [
          { id: 'current', label: t('weeks.current'), value: wonInterval(insight.current) },
          { id: 'previous', label: t('weeks.previous'), value: wonInterval(insight.previous) },
          { id: 'change', label: t('metric.change'), value: f.delta(insight.delta) },
        ],
        rule: t('kinds.shift.rule'),
        context,
      }

    case 'recent-shift':
      return {
        title: t('kinds.patch.title'),
        value: f.delta(insight.delta),
        statement: t('kinds.patch.statement', { subject: insight.subject, points: points(insight.delta), direction: insight.direction, patch: insight.patch, after: f.percent(insight.after.winRate), before: f.percent(insight.before.winRate) }),
        metrics: [
          { id: 'after', label: t('kinds.patch.after'), value: wonInterval(insight.after) },
          { id: 'before', label: t('kinds.patch.before'), value: wonInterval(insight.before) },
        ],
        rule: t('kinds.patch.rule'),
        caveat: t('kinds.patch.caveat'),
        context,
      }

    case 'strong-matchup':
    case 'weak-matchup':
    case 'strong-synergy': {
      const positive = insight.kind !== 'weak-matchup'
      const values = { subject: insight.subject, other: insight.other, relation: insight.relation, positive: positive ? 'yes' : 'no', rate: f.percent(insight.winRate), count: f.integer(insight.matches) }
      const ally = insight.kind === 'strong-synergy'
      return {
        title: t(ally ? 'kinds.pairing.synergyTitle' : positive ? 'kinds.pairing.positiveTitle' : 'kinds.pairing.negativeTitle'),
        value: ally ? insight.other : t('kinds.pairing.versus', values),
        statement: t(ally ? 'kinds.pairing.synergyStatement' : 'kinds.pairing.matchupStatement', values),
        metrics: [
          { id: 'pair', label: t(ally ? 'kinds.pairing.with' : 'kinds.pairing.against', values), value: t('kinds.pairing.result', values) },
          { id: 'interval', label: t('metric.interval'), value: interval(insight.interval.low, insight.interval.high) },
        ],
        rule: t('kinds.pairing.rule', values),
        context,
      }
    }

    case 'popular-build':
      return {
        title: t('kinds.popularBuild.title'),
        value: insight.build,
        statement: t('kinds.popularBuild.statement', { build: insight.build, count: f.integer(insight.buildMatches), subject: insight.subject, share: f.percent(insight.share) }),
        metrics: [
          { id: 'build-matches', label: t('kinds.popularBuild.buildMatches'), value: f.integer(insight.buildMatches) },
          { id: 'tracked-matches', label: t('kinds.popularBuild.trackedMatches'), value: t('kinds.popularBuild.trackedValue', { total: f.integer(insight.total), builds: insight.builds }) },
          { id: 'build-win-rate', label: t('kinds.popularBuild.winRate'), value: t('metric.won', { rate: f.percent(insight.buildWinRate), count: f.integer(insight.buildMatches) }) },
        ],
        rule: t('kinds.popularBuild.rule'),
        caveat: t('kinds.popularBuild.caveat'),
        context,
      }

    case 'high-performing-build':
      return {
        title: t('kinds.highBuild.title'),
        value: insight.build,
        statement: t('kinds.highBuild.statement', { build: insight.build, rate: f.percent(insight.buildRecord.winRate), subject: insight.subject, heroRate: f.percent(insight.heroWinRate) }),
        metrics: [
          { id: 'build', label: t('kinds.highBuild.with'), value: wonInterval(insight.buildRecord) },
          { id: 'hero', label: t('kinds.highBuild.overall', { subject: insight.subject }), value: f.percent(insight.heroWinRate) },
        ],
        rule: t('kinds.highBuild.rule'),
        caveat: t('kinds.highBuild.caveat'),
        context,
      }

    case 'item-trend': {
      const week = (w: { buyers: number; heroMatches: number }) => t('kinds.itemTrend.bought', { buyers: f.integer(w.buyers), matches: f.integer(w.heroMatches) })
      const direction = insight.delta > 0 ? 'up' : 'down'
      return {
        title: t(direction === 'up' ? 'kinds.itemTrend.more' : 'kinds.itemTrend.less'),
        value: insight.item,
        statement: t('kinds.itemTrend.statement', { item: insight.item, current: f.percent(insight.current.share), subject: insight.subject, direction, previous: f.percent(insight.previous.share) }),
        metrics: [
          { id: 'current', label: t('weeks.current'), value: week(insight.current) },
          { id: 'previous', label: t('weeks.previous'), value: week(insight.previous) },
          { id: 'change', label: t('metric.change'), value: f.delta(insight.delta) },
        ],
        rule: t('kinds.itemTrend.rule'),
        context,
      }
    }

    case 'rank-performance':
    case 'length-performance': {
      const byLength = insight.kind === 'length-performance'
      // Length groups are UI labels (translated by key); rank bands are rank names (data).
      const label = (g: SplitGroup) => (byLength ? f.length(g.key) : g.label)
      const within = (g: SplitGroup) => (byLength ? t(`kinds.split.lengthIn.${g.key}`) : g.label)
      return {
        title: t(byLength ? 'kinds.split.lengthTitle' : 'kinds.split.rankTitle'),
        value: label(insight.best),
        statement: t('kinds.split.statement', { subject: insight.subject, best: within(insight.best), bestRate: f.percent(insight.best.winRate), worst: within(insight.worst), worstRate: f.percent(insight.worst.winRate) }),
        metrics: insight.groups.map((g) => ({
          id: `group-${g.key}`,
          label: label(g),
          value: t(g.sample === 'low' ? 'metric.wonLow' : 'metric.won', { rate: f.percent(g.winRate), count: f.integer(g.matches) }),
        })),
        rule: t('kinds.split.rule', { by: byLength ? 'length' : 'rank' }),
        caveat: byLength ? undefined : t('kinds.split.rankCaveat'),
        context,
      }
    }

    case 'rank-popularity':
      return {
        title: t('kinds.rankPopularity.title'),
        value: insight.band,
        statement: t('kinds.rankPopularity.statement', { band: insight.band, pick: f.percent(insight.pick), overall: f.percent(insight.overall) }),
        metrics: [
          { id: 'band', label: t('kinds.rankPopularity.bandPick', { band: insight.band }), value: t('kinds.rankPopularity.estimate', { count: f.integer(insight.bandHeroMatches), total: f.integer(insight.bandMatches) }) },
          { id: 'all', label: t('kinds.rankPopularity.allRanks'), value: t('kinds.rankPopularity.estimate', { count: f.integer(insight.heroAll), total: f.integer(insight.matchesAll) }) },
          { id: 'ratio', label: t('kinds.rankPopularity.ratio'), value: t('kinds.rankPopularity.ratioValue', { ratio: insight.ratio.toFixed(1) }) },
        ],
        rule: t('kinds.rankPopularity.rule'),
        caveat: t('kinds.rankPopularity.caveat', { subject: insight.subject }),
        context,
      }

    case 'purchase-timing': {
      const phase = f.phase(insight.phase)
      return {
        title: t('kinds.purchaseTiming.title'),
        value: t('kinds.purchaseTiming.phase', phase),
        statement: t('kinds.purchaseTiming.statement', { item: insight.item, range: phase.range, rate: f.percent(insight.winRate), gap: lead(insight.gap), adjusted: lead(insight.adjustedGap) }),
        metrics: insight.phases.map((p) => ({
          id: `phase-${p.key}`,
          label: t('kinds.purchaseTiming.phase', f.phase(p.key)),
          value: t('kinds.purchaseTiming.metric', { rate: f.percent(p.winRate), adjusted: f.percent(p.adjustedWinRate), count: f.integer(p.matches) }),
        })),
        rule: t('kinds.purchaseTiming.rule'),
        caveat: t('kinds.purchaseTiming.caveat'),
        context: t('context.phases', { scope: f.scope(insight.scope), count: f.integer(insight.sampleSize), sample: f.sample(insight.sample) }),
      }
    }
  }
}
