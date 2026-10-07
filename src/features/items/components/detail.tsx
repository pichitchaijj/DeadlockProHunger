import Link from 'next/link'
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
import { STANDOUT_RULE, type HeroItemRow, type ItemRow, type PhaseRow } from '../model'
import { itemHref, type ItemScopeQuery } from '../query'

/** Layer 1: the four headline numbers, each with its sample. */
export function ItemPerformance({ row, scope }: { row: ItemRow; scope: StatScope }) {
  const s: StatScope = { ...scope, sampleSize: row.matches }
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Win rate"
        value={row.winRate}
        format="percent"
        scope={s}
        interval={row.interval}
        showScope={false}
        featured
        why={`Matches won by players who bought ${row.name}, out of every match where it was bought. 95% interval ${formatPercent(row.interval.low)}–${formatPercent(row.interval.high)}. Players who are ahead buy more items, so this partly reflects the lead, not only the item.`}
      />
      {row.buyRate === null ? (
        <article className={cx(cardClasses({}), 'flex flex-col gap-3 p-(--spacing-card)')}>
          <h3 className="text-eyebrow">Buy rate</h3>
          <p className="text-sm text-text-muted">Unavailable: the total number of matches in this scope couldn’t be loaded, so no rate is shown.</p>
        </article>
      ) : (
        <StatCard
          label="Buy rate"
          value={row.buyRate}
          format="percent"
          scope={s}
          showScope={false}
          why="Share of player-matches in this scope in which the item was bought (the selected hero’s matches when a hero is chosen)."
        />
      )}
      <StatCard label="Purchases" value={row.matches} format="integer" scope={s} showScope={false} why="Player-matches in which the item was bought." />
      <StatCard label="Average buy time" value={row.avgBuyTimeS} format="duration" scope={s} showScope={false} why="Average match clock (minutes:seconds) at purchase." />
    </div>
  )
}

/** Purchase phases from the API's fixed time phases: share of purchases, raw and net-worth-adjusted win rate. */
export function PurchasePhases({ phases }: { phases: PhaseRow[] }) {
  return (
    <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {phases.map((phase, i) => (
        <Reveal as="li" key={phase.key} index={i} className={cx(cardClasses({}), 'flex flex-col gap-3 p-4')}>
          <header className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-ui text-sm font-semibold text-text">{phase.label}</h3>
              <p className="text-caption text-text-muted">{phase.range}</p>
            </div>
            {phase.stats && <ConfidenceBadge sampleSize={phase.stats.matches} interval={phase.stats.interval} />}
          </header>
          {phase.stats ? (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
              <div className="col-span-2">
                <dt className="text-caption text-text-muted">Bought in this phase</dt>
                <dd className="flex items-center gap-2">
                  <span className="font-display text-display-m font-bold text-text tabular">{formatPercent(phase.stats.share, 0)}</span>
                  <span aria-hidden="true" className="h-1.5 flex-1 rounded-pill bg-surface-sunken">
                    <span className="block h-full rounded-pill bg-steel" style={{ width: `${Math.max(2, phase.stats.share * 100)}%` }} />
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-caption text-text-muted">Win rate</dt>
                <dd>
                  <WinRate value={phase.stats.winRate} />
                </dd>
              </div>
              <div>
                <dt className="text-caption text-text-muted" title="Re-weighted to this phase’s net-worth distribution (source: item-flow-stats)">
                  Net-worth adjusted
                </dt>
                <dd className="font-ui text-sm font-semibold text-text tabular">{formatPercent(phase.stats.adjustedWinRate)}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-text-muted">Fewer than {formatInteger(ITEM_MIN_MATCHES)} purchases in this phase: not shown.</p>
          )}
        </Reveal>
      ))}
    </ol>
  )
}

/** Shown when no phase passes the rule: says so, with the rule, rather than picking the highest number. */
export function NoStandout() {
  return (
    <div className="rounded-md border border-dashed border-border-strong px-(--spacing-card) py-4">
      <h3 className="text-eyebrow">Purchase timing</h3>
      <p className="mt-2 font-ui font-semibold text-text">No purchase phase stands out</p>
      <p className="mt-1 text-sm text-text-muted">{STANDOUT_RULE} No phase meets all of these in this scope, so none is named.</p>
    </div>
  )
}

/** Heroes whose players buy the item most often (share of that hero’s matches), with their win rate. */
export function ItemHeroes({ rows, query, itemSlug }: { rows: HeroItemRow[]; query: ItemScopeQuery; itemSlug: string }) {
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
              <span className="block text-caption text-text-muted tabular">
                Bought in {formatPercent(h.buyRate, 0)} of matches · {formatInteger(h.matches)}
              </span>
            </span>
            <WinRate value={h.winRate} className="items-end" />
          </Link>
        </Reveal>
      ))}
    </ol>
  )
}

export function PerformanceSkeleton() {
  return (
    <LoadingState label="Loading item performance">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    </LoadingState>
  )
}

export function TimingSkeleton() {
  return (
    <LoadingState label="Loading purchase timings">
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

export function HeroesSkeleton() {
  return (
    <LoadingState label="Loading heroes">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    </LoadingState>
  )
}
