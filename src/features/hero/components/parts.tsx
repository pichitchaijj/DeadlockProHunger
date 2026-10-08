import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import type { ReactNode } from 'react'
import { ConfidenceBadge } from '@/components/data/ConfidenceBadge'
import { AbilityIcon, ItemIcon } from '@/components/game-assets/ItemIcon'
import { HeroPortrait } from '@/components/game-assets/HeroPortrait'
import { Reveal } from '@/components/motion/Reveal'
import type { Comparison } from '@/lib/analytics/compare'
import { cx } from '@/lib/cx'
import { domainLabel, toPercent, winRateDomain } from '@/lib/scale'
import { formatDuration, formatPercent } from '@/lib/format'
import type { AbilityOrder, HeroBuild, Pairing, ProgressionItem } from '../model'
import { ScrollRegion } from '@/components/ui/ScrollRegion'

/** Panel used by every tab section. */
export function Panel({ title, description, actions, children, className }: { title: string; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('flex flex-col rounded-md border border-border bg-surface shadow-card', className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-(--spacing-card) py-4">
        <div className="min-w-0">
          <h3 className="font-ui text-title font-semibold text-text">{title}</h3>
          {description && <p className="mt-1 text-sm text-text-muted">{description}</p>}
        </div>
        {actions}
      </header>
      <div className="flex-1 p-(--spacing-card)">{children}</div>
    </section>
  )
}

/** Matchup / synergy list. Cards reveal in sequence. */
/** Color follows the value (interval vs 50%), never the list it appears in. */
export function PairingList({ items, empty }: { items: Pairing[]; empty: string; tone?: 'positive' | 'negative' }) {
  if (items.length === 0) return <p className="text-sm text-text-muted">{empty}</p>
  return (
    <ol className="flex flex-col gap-2">
      {items.map((p, i) => (
        <Reveal as="li" key={p.id} index={i}>
          <Link
            href={`/heroes/${p.slug}`}
            className="group flex items-center gap-3 rounded-sm border border-border bg-surface-sunken px-3 py-2 transition-colors duration-(--dur-fast) hover:border-border-control hover:bg-surface-raised"
          >
            <HeroPortrait name={p.name} src={p.iconUrl ?? undefined} size="sm" />
            <span className="min-w-0 flex-1 truncate font-ui text-sm font-semibold text-text group-hover:text-highlight">{p.name}</span>
            <span
              className={cx(
                'font-ui text-sm font-semibold tabular',
                p.interval.low > 0.5 ? 'text-positive' : p.interval.high < 0.5 ? 'text-negative' : 'text-text',
              )}
            >
              {formatPercent(p.winRate)}
            </span>
            <ConfidenceBadge sampleSize={p.matches} interval={p.interval} className="max-sm:hidden" />
          </Link>
        </Reveal>
      ))}
    </ol>
  )
}

/**
 * Win rate per group on a 50%-centered scale with the 95% interval as a whisker. Bars grow in.
 * `labels` translates groups by key (e.g. match-length groups); groups without one keep their own label
 * (rank bands, whose names are game data).
 */
export function SplitBars({ comparison, labels }: { comparison: Comparison; labels?: Record<string, string> }) {
  const t = useTranslations('heroes.parts')
  const domain = winRateDomain(comparison.groups.filter((g) => g.matches > 0).flatMap((g) => [g.winRate, g.interval.low, g.interval.high]))
  const toPct = (v: number) => toPercent(v, domain)
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {comparison.groups.map((g, i) => {
          const low = g.sample === 'low'
          const lead = comparison.clear && comparison.best?.key === g.key
          const label = labels?.[g.key] ?? g.label
          return (
            <li key={g.key} className="grid grid-cols-[7.5rem_1fr_3.5rem] items-center gap-3 max-sm:grid-cols-[6rem_1fr_3.25rem]">
              <span className={cx('font-ui text-sm leading-tight', lead ? 'font-semibold text-text' : 'text-text-muted')}>
                {label}
              </span>
              <span aria-hidden="true" className="relative h-2.5 rounded-pill bg-surface-sunken">
                <span className="absolute inset-y-[-4px] left-1/2 w-px bg-text-muted/50" />
                {g.matches > 0 && (
                  <>
                    <span
                      className={cx('absolute inset-y-0 left-0 origin-left rounded-pill animate-grow', low ? 'bg-steel/60' : lead ? 'bg-primary' : 'bg-steel')}
                      style={{ width: `${toPct(g.winRate)}%`, animationDelay: `${i * 80}ms` }}
                    />
                    {!low && (
                      <span
                        className="absolute top-1/2 h-1 -translate-y-1/2 rounded-pill bg-text/60"
                        style={{ left: `${toPct(g.interval.low)}%`, width: `${Math.max(1, toPct(g.interval.high) - toPct(g.interval.low))}%` }}
                      />
                    )}
                  </>
                )}
              </span>
              <span className={cx('text-right font-ui text-sm tabular', low ? 'text-text-muted' : 'text-text')}>
                {g.matches > 0 ? formatPercent(g.winRate) : '—'}
              </span>
              <span className="sr-only">
                {g.matches > 0
                  ? t(low ? 'splitValueLow' : 'splitValue', { group: label, rate: formatPercent(g.winRate), count: g.matches })
                  : t('splitNoData', { group: label })}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="text-caption text-text-muted">
        {t('splitLegend', { scale: domainLabel(domain) })} {comparison.clear ? t('splitClear') : t('splitUnclear')}
      </p>
    </div>
  )
}

const MAX_ITEMS_PER_SECTION = 12

/*
 * The build and ability parts below are shared with pages that aren't localized yet (Analyze, Compare,
 * Build detail), so they don't translate themselves: a caller passes `labels`, and without them the
 * text stays English. Heroes passes its translations (useBuildLabels / useAbilityLabels in tabs.tsx).
 */

export type BuildItemLabels = { moreItems: (count: number) => string; moreSections: (count: number) => string }

const BUILD_ITEM_LABELS: BuildItemLabels = {
  moreItems: (count) => `+${count} more items`,
  moreSections: (count) => `+${count} more sections in the full build`,
}

/** A build's items in category order; items appear one after another (build item sequence). */
export function BuildItemSequence({ build, maxCategories = 4, labels = BUILD_ITEM_LABELS }: { build: HeroBuild; maxCategories?: number; labels?: BuildItemLabels }) {
  let n = 0
  return (
    <ol className="flex flex-col gap-3">
      {build.categories.slice(0, maxCategories).map((category) => (
        <li key={category.name} className="flex flex-col gap-1.5">
          <span className="text-caption text-text-muted">{category.name}</span>
          <ul className="flex flex-wrap gap-1.5">
            {category.items.slice(0, MAX_ITEMS_PER_SECTION).map((item) => {
              const delay = Math.min(n++, 23) * 45
              return (
                <li key={`${category.name}-${item.id}`} className="animate-scale-in" style={{ animationDelay: `${150 + delay}ms` }}>
                  <ItemIcon name={item.name ?? 'Item'} src={item.icon} slot={item.slot} tier={item.tier} />
                </li>
              )
            })}
          </ul>
          {category.items.length > MAX_ITEMS_PER_SECTION && (
            <span className="text-caption text-text-muted">{labels.moreItems(category.items.length - MAX_ITEMS_PER_SECTION)}</span>
          )}
        </li>
      ))}
      {build.categories.length > maxCategories && <li className="text-caption text-text-muted">{labels.moreSections(build.categories.length - maxCategories)}</li>}
    </ol>
  )
}

export type BuildStatsLabels = { noMatches: string; winRate: string }

const BUILD_STATS_LABELS: BuildStatsLabels = {
  noMatches: 'No tracked matches for this build in this scope.',
  winRate: 'win rate when selected at game start',
}

export function BuildStatsLine({ build, labels = BUILD_STATS_LABELS }: { build: HeroBuild; labels?: BuildStatsLabels }) {
  if (!build.stats) return <p className="text-caption text-text-muted">{labels.noMatches}</p>
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-text">
      <span className={cx('font-semibold tabular', build.stats.sample === 'low' && 'text-text-muted')}>{formatPercent(build.stats.winRate)}</span>
      <span className="text-text-muted">{labels.winRate}</span>
      <ConfidenceBadge sampleSize={build.stats.matches} />
    </p>
  )
}

type AbilityMap = Map<number, { name: string; icon: string | null; kind: string | null }>

export type AbilityLabels = { region: string; upgradeOrder: (steps: string) => string; ability: string; unknownAbility: string }

const ABILITY_LABELS: AbilityLabels = {
  region: 'Ability upgrade order',
  upgradeOrder: (steps) => `Upgrade order: ${steps}`,
  ability: 'Ability',
  unknownAbility: 'Unknown ability',
}

/** Skill-order grid: rows = abilities, columns = upgrade steps. Cells fill in sequence. */
export function AbilitySequence({ order, abilities, labels = ABILITY_LABELS }: { order: AbilityOrder; abilities: AbilityMap; labels?: AbilityLabels }) {
  const rows = [...new Set(order.sequence)].sort((a, b) => order.sequence.indexOf(a) - order.sequence.indexOf(b))
  // Ability names are game data; only the fallback for a missing one is UI text.
  const name = (id: number) => abilities.get(id)?.name ?? labels.unknownAbility
  return (
    <ScrollRegion label={labels.region}>
      <table className="border-separate border-spacing-1 font-ui text-sm">
        <caption className="sr-only">{labels.upgradeOrder(order.sequence.map((id, i) => `${i + 1}. ${name(id)}`).join(', '))}</caption>
        <thead>
          <tr>
            <th scope="col" className="sr-only">{labels.ability}</th>
            {order.sequence.map((_, i) => (
              <th key={i} scope="col" className="w-8 text-center text-caption font-normal text-text-muted tabular">
                {i + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((id) => {
            const ability = abilities.get(id)
            return (
              <tr key={id}>
                <th scope="row" className="pr-2 text-left font-normal">
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <AbilityIcon name={ability?.name ?? labels.ability} src={ability?.icon ?? null} size={28} decorative />
                    <span className="text-text">{name(id)}</span>
                  </span>
                </th>
                {order.sequence.map((stepId, step) => (
                  <td key={step} className="text-center">
                    {stepId === id ? (
                      <span
                        className="inline-flex size-7 animate-scale-in items-center justify-center rounded-xs bg-primary font-display text-sm font-bold text-on-primary"
                        style={{ animationDelay: `${120 + step * 60}ms` }}
                      >
                        {step + 1}
                      </span>
                    ) : (
                      <span aria-hidden="true" className="inline-block size-7 rounded-xs bg-surface-sunken" />
                    )}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </ScrollRegion>
  )
}

/** Item progression by phase. Win rates are shown muted with an explicit caveat. */
export function ItemProgressionView({ phases }: { phases: Array<{ key: string; label: string; items: ProgressionItem[] }> }) {
  const t = useTranslations('heroes.parts')
  // Phase keys are early/mid/late (model); a phase without a translation keeps its own label.
  const phaseLabel = (key: string, fallback: string) => (key === 'early' || key === 'mid' || key === 'late' ? t(`phases.${key}`) : fallback)
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {phases.map((phase, p) => (
        <div key={phase.key} className="flex flex-col gap-2">
          <h4 className="text-eyebrow">{phaseLabel(phase.key, phase.label)}</h4>
          {phase.items.length === 0 ? (
            <p className="text-sm text-text-muted">{t('noPhaseItems')}</p>
          ) : (
            <ol className="flex flex-col gap-1.5">
              {phase.items.map((item, i) => (
                <Reveal as="li" key={item.id} index={p * 3 + i}>
                  <span className="flex items-center gap-3 rounded-sm bg-surface-sunken px-2 py-1.5">
                    <ItemIcon name={item.name ?? 'Item'} src={item.icon} slot={item.slot} tier={item.tier} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-ui text-sm font-semibold text-text">{item.name}</span>
                      <span className="block text-caption text-text-muted tabular">
                        {t('buyStats', { time: formatDuration(item.avgBuyTimeS), rate: formatPercent(item.buyRate, 0) })}
                      </span>
                    </span>
                    <span className="text-right text-caption text-text-muted tabular" title={t('itemWinRate')}>
                      {formatPercent(item.winRate)}
                    </span>
                  </span>
                </Reveal>
              ))}
            </ol>
          )}
        </div>
      ))}
    </div>
  )
}
