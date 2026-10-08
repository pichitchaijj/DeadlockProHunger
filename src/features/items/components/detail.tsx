import { useLocale, useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { WinRate } from '@/components/cards/WinRate'
import { ConfidenceBadge } from '@/components/data/ConfidenceBadge'
import { StatCard } from '@/components/data/StatCard'
import { HeroPortrait } from '@/components/game-assets/HeroPortrait'
import { Reveal } from '@/components/motion/Reveal'
import { cardClasses } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { LoadingState } from '@/components/ui/States'
import type { StatScope } from '@/lib/analytics/scope'
import { ITEM_MIN_MATCHES } from '@/lib/deadlock/constants'
import { formatInteger, formatPercent } from '@/lib/format'
import { cx } from '@/lib/cx'
import type { HeroItemRow, ItemRow, PhaseRow } from '../model'
import { itemHref, type ItemScopeQuery } from '../query'

/*
 * Item detail parts (Items pages only), worded from the Items catalog (items.*). StatCard is shared,
 * so its "Why?" disclosure gets its labels from here.
 */

/** Layer 1: the four headline numbers, each with its sample. */
export function ItemPerformance({ row, scope }: { row: ItemRow; scope: StatScope }) {
  const t = useTranslations('items.performance')
  const winRate = useTranslations('cards')('winRate')
  const s: StatScope = { ...scope, sampleSize: row.matches }
  const whyLabels = { show: t('why'), hide: t('hideWhy') }
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label={winRate}
        value={row.winRate}
        format="percent"
        scope={s}
        interval={row.interval}
        showScope={false}
        featured
        why={t('winRateWhy', { item: row.name, low: formatPercent(row.interval.low), high: formatPercent(row.interval.high) })}
        whyLabels={whyLabels}
      />
      {row.buyRate === null ? (
        <article className={cx(cardClasses({}), 'flex flex-col gap-3 p-(--spacing-card)')}>
          <h3 className="text-eyebrow">{t('buyRate')}</h3>
          <p className="text-sm text-text-muted">{t('buyRateUnavailable')}</p>
        </article>
      ) : (
        <StatCard label={t('buyRate')} value={row.buyRate} format="percent" scope={s} showScope={false} why={t('buyRateWhy')} whyLabels={whyLabels} />
      )}
      <StatCard label={t('purchases')} value={row.matches} format="integer" scope={s} showScope={false} why={t('purchasesWhy')} whyLabels={whyLabels} />
      <StatCard label={t('avgBuyTime')} value={row.avgBuyTimeS} format="duration" scope={s} showScope={false} why={t('avgBuyTimeWhy')} whyLabels={whyLabels} />
    </div>
  )
}

/** Catalog keys for the model's phase keys (PURCHASE_PHASES). */
const PHASE_KEYS = { early: 'early', mid: 'mid', late: 'late', 'very-late': 'veryLate' } as const satisfies Record<PhaseRow['key'], string>

/** Purchase phases from the API's fixed time phases: share of purchases, raw and net-worth-adjusted win rate. */
export function PurchasePhases({ phases }: { phases: PhaseRow[] }) {
  const t = useTranslations('items.phases')
  const winRate = useTranslations('cards')('winRate')
  const locale = useLocale()
  return (
    <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {phases.map((phase, i) => (
        <Reveal as="li" key={phase.key} index={i} className={cx(cardClasses({}), 'flex flex-col gap-3 p-4')}>
          <header className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-ui text-sm font-semibold text-text">{t(PHASE_KEYS[phase.key])}</h3>
              <p className="text-caption text-text-muted">{t(`${PHASE_KEYS[phase.key]}Range`)}</p>
            </div>
            {phase.stats && <ConfidenceBadge sampleSize={phase.stats.matches} interval={phase.stats.interval} />}
          </header>
          {phase.stats ? (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
              <div className="col-span-2">
                <dt className="text-caption text-text-muted">{t('boughtIn')}</dt>
                <dd className="flex items-center gap-2">
                  <span className="font-display text-display-m font-bold text-text tabular">{formatPercent(phase.stats.share, 0)}</span>
                  <span aria-hidden="true" className="h-1.5 flex-1 rounded-pill bg-surface-sunken">
                    <span className="block h-full rounded-pill bg-steel" style={{ width: `${Math.max(2, phase.stats.share * 100)}%` }} />
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-caption text-text-muted">{winRate}</dt>
                <dd>
                  <WinRate value={phase.stats.winRate} />
                </dd>
              </div>
              <div>
                <dt className="text-caption text-text-muted" title={t('adjustedTitle')}>
                  {t('adjusted')}
                </dt>
                <dd className="font-ui text-sm font-semibold text-text tabular">{formatPercent(phase.stats.adjustedWinRate)}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-text-muted">{t('fewer', { count: formatInteger(ITEM_MIN_MATCHES, locale) })}</p>
          )}
        </Reveal>
      ))}
    </ol>
  )
}

/** Shown when no phase passes the rule (model STANDOUT_RULE): says so, with the rule, rather than picking the highest number. */
export function NoStandout() {
  const t = useTranslations('items')
  return (
    <div className="rounded-md border border-dashed border-border-strong px-(--spacing-card) py-4">
      <h3 className="text-eyebrow">{t('detail.timingTitle')}</h3>
      <p className="mt-2 font-ui font-semibold text-text">{t('phases.noneTitle')}</p>
      <p className="mt-1 text-sm text-text-muted">{t('phases.noneDescription')}</p>
    </div>
  )
}

/** Heroes whose players buy the item most often (share of that hero’s matches), with their win rate. */
export function ItemHeroes({ rows, query, itemSlug }: { rows: HeroItemRow[]; query: ItemScopeQuery; itemSlug: string }) {
  const t = useTranslations('items.detail')
  const locale = useLocale()
  return (
    <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((h, i) => (
        <Reveal as="li" key={h.id} index={i}>
          <Link
            href={itemHref(itemSlug, query, { hero: h.slug })}
            className="group flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2.5 hover:border-border-strong"
          >
            <HeroPortrait name={h.name} src={h.iconUrl ?? undefined} size="sm" decorative />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-ui text-sm font-semibold text-text group-hover:text-highlight">{h.name}</span>
              <span className="block text-caption text-text-muted tabular">{t('heroRow', { rate: formatPercent(h.buyRate, 0), count: formatInteger(h.matches, locale) })}</span>
            </span>
            <WinRate value={h.winRate} className="items-end" />
          </Link>
        </Reveal>
      ))}
    </ol>
  )
}

export function PerformanceSkeleton({ label }: { label: string }) {
  return (
    <LoadingState label={label}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    </LoadingState>
  )
}

export function TimingSkeleton({ label }: { label: string }) {
  return (
    <LoadingState label={label}>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-64 sm:h-80" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      </div>
    </LoadingState>
  )
}

export function HeroesSkeleton({ label }: { label: string }) {
  return (
    <LoadingState label={label}>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    </LoadingState>
  )
}
