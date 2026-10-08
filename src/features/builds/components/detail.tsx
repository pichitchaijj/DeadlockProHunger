import { useLocale, useTranslations } from 'next-intl'
import { ConfidenceBadge } from '@/components/data/ConfidenceBadge'
import { AbilityIcon, ItemIcon } from '@/components/game-assets/ItemIcon'
import { InView } from '@/components/motion/InView'
import { cx } from '@/lib/cx'
import { domainLabel, toPercent, winRateDomain } from '@/lib/scale'
import { formatDuration, formatInteger, formatPercent } from '@/lib/format'
import type { ShopItemRef } from '@/features/hero/model'
import { FLOW_COLUMN_LABELS, type BuildStats, type FlowItem, type PlanStep, type TimedItem } from '../model'
import { ScrollRegion } from '@/components/ui/ScrollRegion'

const NUMERALS = ['', 'I', 'II', 'III']

type AbilityMap = Map<number, { name: string; icon: string | null; kind: string | null }>

/*
 * ItemRow is shared with Compare and has no text of its own. The other parts here render only on the
 * Build detail page, so they read the Builds catalog (builds.*) directly.
 */

/** Items assemble one after another (CSS, plays once when the section mounts). */
export function ItemRow({ items, startIndex = 0, size = 40 }: { items: ShopItemRef[]; startIndex?: number; size?: number }) {
  return (
    // Build assembly: items appear one after another when the row scrolls into view.
    <InView as="ul" className="flex flex-wrap gap-2">
      {items.map((item, i) => (
        <li key={item.id} className="animate-scale-in" style={{ animationDelay: `${120 + Math.min(startIndex + i, 30) * 55}ms` }}>
          <ItemIcon name={item.name ?? 'Item'} src={item.icon} slot={item.slot} tier={item.tier} size={size} />
        </li>
      ))}
    </InView>
  )
}

/** Early / Core / Late by observed buy time, with names and timings as text. */
export function PhaseColumns({ phases, untimed }: { phases: Array<{ key: string; label: string; note: string; items: TimedItem[] }>; untimed: TimedItem[] }) {
  const t = useTranslations('builds.phases')
  // Phase keys are the model's early/core/late; any other phase keeps its own label.
  const text = (phase: { key: string; label: string; note: string }) =>
    phase.key === 'early' || phase.key === 'core' || phase.key === 'late' ? { label: t(phase.key), note: t(`${phase.key}Note`) } : phase
  // Stagger continues across columns: precompute each column's first index.
  const starts = phases.map((_, i) => phases.slice(0, i).reduce((n, p) => n + p.items.length, 0))
  const untimedStart = phases.reduce((n, p) => n + p.items.length, 0)
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        {phases.map((phase, p) => {
          const start = starts[p]
          const { label, note } = text(phase)
          return (
            <section key={phase.key} aria-label={t('items', { phase: label })} className="flex flex-col gap-3 rounded-md border border-border bg-surface-sunken p-4">
              <header>
                <h4 className="font-display text-title font-bold text-text uppercase">{label}</h4>
                <p className="text-caption text-text-muted">{note}</p>
              </header>
              {phase.items.length === 0 ? (
                <p className="text-sm text-text-muted">{t('noItems')}</p>
              ) : (
                <>
                  <ItemRow items={phase.items} startIndex={start} />
                  <ul className="flex flex-col gap-0.5 text-caption text-text-muted">
                    {phase.items.map((item) => (
                      <li key={item.id} className="flex justify-between gap-2">
                        <span className="truncate text-text">{item.name}</span>
                        <span className="tabular">~{formatDuration(item.avgBuyTimeS!)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )
        })}
      </div>
      {untimed.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-caption text-text-muted">{t('untimed')}</p>
          <ItemRow items={untimed} startIndex={untimedStart} size={32} />
        </div>
      )}
    </div>
  )
}

/** Author's ability plan: rows = abilities, columns = steps; ● = unlock, I–III = upgrade level. */
export function AbilityPlanGrid({ plan, abilities }: { plan: PlanStep[]; abilities: AbilityMap }) {
  const t = useTranslations('builds.plan')
  const rows = [...new Set(plan.map((s) => s.abilityId))]
  // Ability names are game data; only the fallbacks for a missing one are UI text.
  const steps = plan
    .map((s, i) => t('step', { n: i + 1, action: s.kind === 'unlock' ? t('unlock') : t('upgrade', { level: s.level }), ability: abilities.get(s.abilityId)?.name ?? t('abilityFallback') }))
    .join(', ')
  return (
    <ScrollRegion label={t('region')}>
      <table className="border-separate border-spacing-1 font-ui text-sm">
        <caption className="sr-only">{t('caption', { steps })}</caption>
        <thead>
          <tr>
            <th scope="col" className="sr-only">{t('ability')}</th>
            {plan.map((_, i) => (
              <th key={i} scope="col" className="w-7 text-center text-caption font-normal text-text-muted tabular">
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
                    <AbilityIcon name={ability?.name ?? t('ability')} src={ability?.icon ?? null} size={28} decorative />
                    <span className="text-text">{ability?.name ?? t('unknownAbility')}</span>
                  </span>
                </th>
                {plan.map((step, i) =>
                  step.abilityId === id ? (
                    <td key={i} className="text-center">
                      <span
                        className={cx(
                          'inline-flex size-7 animate-scale-in items-center justify-center rounded-xs font-display text-xs font-bold',
                          step.kind === 'unlock' ? 'border border-primary text-primary' : 'bg-primary text-on-primary',
                        )}
                        style={{ animationDelay: `${100 + i * 55}ms` }}
                      >
                        {step.kind === 'unlock' ? '●' : NUMERALS[step.level]}
                      </span>
                    </td>
                  ) : (
                    <td key={i} className="text-center">
                      <span aria-hidden="true" className="inline-block size-7 rounded-xs bg-surface-sunken" />
                      <span className="sr-only">–</span>
                    </td>
                  ),
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </ScrollRegion>
  )
}

/** Item timing table: every timed item in buy order. */
export function TimingTable({ items }: { items: TimedItem[] }) {
  const t = useTranslations('builds.timing')
  if (items.length === 0) return <p className="text-sm text-text-muted">{t('empty')}</p>
  return (
    <ScrollRegion label={t('region')} className="rounded-md border border-border">
      <table className="w-full font-ui text-sm">
        <caption className="sr-only">{t('caption')}</caption>
        <thead className="bg-surface text-eyebrow">
          <tr>
            <th scope="col" className="px-3 py-2 text-left">{t('item')}</th>
            <th scope="col" className="px-3 py-2 text-right">{t('avgBuyTime')}</th>
            <th scope="col" className="px-3 py-2 text-right">{t('boughtIn')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-t border-border hover:bg-surface-raised/60">
              <td className="px-3 py-2">
                <span className="flex items-center gap-2">
                  <ItemIcon name={item.name ?? 'Item'} src={item.icon} slot={item.slot} tier={item.tier} size={28} decorative />
                  <span className="text-text">{item.name}</span>
                </span>
              </td>
              <td className="px-3 py-2 text-right text-text tabular">{formatDuration(item.avgBuyTimeS!)}</td>
              <td className="px-3 py-2 text-right text-text-muted tabular">{item.buyRate !== null ? t('ofMatches', { rate: formatPercent(item.buyRate, 0) }) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  )
}

/** Item flow: build items placed in the phase column they're most often bought in, with adjusted win rate. */
const FLOW_COLUMN_KEYS = ['0', '1', '2', '3'] as const

export function FlowView({ flow }: { flow: { items: FlowItem[]; transitions: Array<{ from: ShopItemRef; to: ShopItemRef; matches: number }>; baselineWinRate: number | null } }) {
  const t = useTranslations('builds.flow')
  const locale = useLocale()
  return (
    <div className="flex flex-col gap-5">
      <ol className="grid gap-3 md:grid-cols-4">
        {FLOW_COLUMN_LABELS.map((label, column) => {
          const items = flow.items.filter((i) => i.column === column)
          const key = FLOW_COLUMN_KEYS[column]
          return (
            <li key={label} className="flex flex-col gap-2 rounded-md border border-border bg-surface-sunken p-3">
              <span className="text-eyebrow">{key ? t(`columns.${key}`) : label}</span>
              {items.length === 0 ? (
                <span className="text-caption text-text-muted">—</span>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {items.map((item) => {
                    const above = flow.baselineWinRate !== null && item.adjustedWinRate > flow.baselineWinRate
                    return (
                      <li key={item.id} className="flex items-center gap-2">
                        <ItemIcon name={item.name ?? 'Item'} src={item.icon} slot={item.slot} tier={item.tier} size={28} decorative />
                        <span className="min-w-0 flex-1 truncate text-caption text-text">{item.name}</span>
                        {/* Above the hero's baseline: an arrow and words, not only the color. */}
                        <span className={cx('text-caption tabular', above ? 'text-positive' : 'text-text-muted')} title={t('adjustedTitle')}>
                          {above && <span aria-hidden="true">▲ </span>}
                          {formatPercent(item.adjustedWinRate)}
                          {above && <span className="sr-only">{t('aboveAverage')}</span>}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ol>
      {flow.transitions.length > 0 && (
        <div>
          <h4 className="mb-2 text-eyebrow">{t('nextTitle')}</h4>
          <ol className="flex flex-col gap-1.5">
            {flow.transitions.map((edge) => (
              <li key={`${edge.from.id}-${edge.to.id}`} className="flex flex-wrap items-center gap-2 text-sm">
                <ItemIcon name={edge.from.name ?? 'Item'} src={edge.from.icon} slot={edge.from.slot} tier={edge.from.tier} size={24} decorative />
                <span className="text-text">{edge.from.name}</span>
                <span aria-hidden="true" className="text-text-muted">→</span>
                <span className="sr-only">{t('then')}</span>
                <ItemIcon name={edge.to.name ?? 'Item'} src={edge.to.icon} slot={edge.to.slot} tier={edge.to.tier} size={24} decorative />
                <span className="text-text">{edge.to.name}</span>
                <span className="text-caption text-text-muted tabular">{t('players', { count: formatInteger(edge.matches, locale) })}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <p className="text-caption text-text-muted">
        {t('explanation')}
        {flow.baselineWinRate !== null && ` ${t('baseline', { rate: formatPercent(flow.baselineWinRate) })}`}
      </p>
    </div>
  )
}

/** Build vs hero win rate on a 50%-centered scale, with the build's 95% interval. */
export function PerformanceCompare({ stats, heroWinRate, heroName }: { stats: BuildStats; heroWinRate: number | null; heroName: string }) {
  const t = useTranslations('builds.performance')
  const domain = winRateDomain([stats.winRate, stats.interval.low, stats.interval.high, ...(heroWinRate !== null ? [heroWinRate] : [])])
  const toPct = (v: number) => toPercent(v, domain)
  const rows = [
    { label: t('thisBuild'), value: stats.winRate, interval: stats.interval, primary: true },
    ...(heroWinRate !== null ? [{ label: t('heroOverall', { hero: heroName }), value: heroWinRate, interval: null, primary: false }] : []),
  ]
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {rows.map((row, i) => (
          <li key={row.label} className="grid grid-cols-[8rem_1fr_3.5rem] items-center gap-3 max-sm:grid-cols-[6.5rem_1fr_3.25rem]">
            <span className={cx('font-ui text-sm leading-tight', row.primary ? 'font-semibold text-text' : 'text-text-muted')}>{row.label}</span>
            <span aria-hidden="true" className="relative h-2.5 rounded-pill bg-surface-sunken">
              <span className="absolute inset-y-[-4px] left-1/2 w-px bg-text-muted/50" />
              <span className={cx('absolute inset-y-0 left-0 origin-left rounded-pill animate-grow', row.primary ? 'bg-primary' : 'bg-steel')} style={{ width: `${toPct(row.value)}%`, animationDelay: `${i * 90}ms` }} />
              {row.interval && (
                <span
                  className="absolute top-1/2 h-1 -translate-y-1/2 rounded-pill bg-text/60"
                  style={{ left: `${toPct(row.interval.low)}%`, width: `${Math.max(1, toPct(row.interval.high) - toPct(row.interval.low))}%` }}
                />
              )}
            </span>
            <span className="text-right font-ui text-sm text-text tabular">{formatPercent(row.value)}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2 text-caption text-text-muted">
        <ConfidenceBadge sampleSize={stats.matches} interval={stats.interval} />
        {t('scale', { scale: domainLabel(domain) })}
      </div>
    </div>
  )
}
