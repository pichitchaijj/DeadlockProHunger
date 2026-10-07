import { InView } from '@/components/motion/InView'
import { SAMPLE_TIER_THRESHOLDS } from '@/lib/analytics/sampleTier'
import { formatInteger, formatPercent } from '@/lib/format'
import { winRateDomain } from '@/lib/scale'
import { minuteAtShare, plottable, type MinutePoint } from '../model'

type Props = { points: MinutePoint[]; typical: { from: number; to: number } | null }

/** Purchases this much of the total or beyond are left off the x-axis (a long, nearly empty tail). */
const TAIL = 0.99

/**
 * Win rate by purchase minute (line + 95% interval band, 50% reference) over purchase volume per minute
 * (bars, middle half of purchases shaded). Stretched SVGs with HTML axis labels (docs/MOBILE.md), so the
 * chart fits any width; the table under "Show data" holds every value.
 */
export function PurchaseTimingChart({ points, typical }: Props) {
  const plotted = plottable(points)
  const xMax = Math.max(minuteAtShare(points, TAIL), plotted.at(-1)?.minute ?? 0) + 1
  const shown = points.filter((p) => p.minute < xMax)
  const x = (minute: number) => ((minute + 0.5) / xMax) * 100
  const domain = winRateDomain(plotted.flatMap((p) => [p.interval.low, p.interval.high]))
  const y = (v: number) => (1 - (v - domain.min) / (domain.max - domain.min)) * 100
  const maxShare = Math.max(...shown.map((p) => p.share))
  const step = xMax > 40 ? 10 : 5
  // Labels are centered on their tick; one too close to the right edge would overflow the page.
  const ticks = Array.from({ length: Math.floor((xMax - 1) / step) + 1 }, (_, i) => i * step).filter((t) => t / xMax <= 0.94)

  // Contiguous runs of plotted minutes; a gap (a Low-sample minute) breaks the line.
  const runs: MinutePoint[][] = []
  for (const p of plotted) {
    const run = runs.at(-1)
    if (run && p.minute === run[run.length - 1].minute + 1) run.push(p)
    else runs.push([p])
  }

  const best = plotted.reduce<MinutePoint | null>((a, p) => (!a || p.winRate > a.winRate ? p : a), null)
  const worst = plotted.reduce<MinutePoint | null>((a, p) => (!a || p.winRate < a.winRate ? p : a), null)
  const summary = [
    typical && `Half of all purchases happen between minute ${typical.from} and ${typical.to}.`,
    best && worst && plotted.length >= 2
      ? `Across minutes with ${formatInteger(SAMPLE_TIER_THRESHOLDS.moderate)}+ purchases, the win rate ranges from ${formatPercent(worst.winRate)} (bought in minute ${worst.minute}) to ${formatPercent(best.winRate)} (minute ${best.minute}).`
      : `No single minute has ${formatInteger(SAMPLE_TIER_THRESHOLDS.moderate)}+ purchases, so win rates by minute aren’t drawn.`,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <InView as="figure" className="flex min-w-0 flex-col gap-3">
      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-2 gap-y-1.5">
        {plotted.length >= 2 && (
          <>
            <div className="relative h-44 text-right text-caption text-text-muted tabular sm:h-56" aria-hidden="true">
              {[domain.max, 0.5, domain.min].map((v) => (
                <span key={v} className="absolute right-0 -translate-y-1/2" style={{ top: `${y(v)}%` }}>
                  {formatPercent(v, 0)}
                </span>
              ))}
            </div>
            <div className="relative h-44 overflow-hidden rounded-sm border border-border bg-surface-sunken sm:h-56">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 size-full animate-fade-in">
                {[domain.max, domain.min].map((v) => (
                  <line key={v} x1={0} x2={100} y1={y(v)} y2={y(v)} className="stroke-border" vectorEffect="non-scaling-stroke" />
                ))}
                <line x1={0} x2={100} y1={y(0.5)} y2={y(0.5)} className="stroke-text-muted/60" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
                {runs.map((run) => (
                  <g key={run[0].minute}>
                    {run.length > 1 && (
                      <polygon
                        points={[...run.map((p) => `${x(p.minute)},${y(p.interval.high)}`), ...[...run].reverse().map((p) => `${x(p.minute)},${y(p.interval.low)}`)].join(' ')}
                        className="fill-primary/15"
                      />
                    )}
                    <polyline
                      points={run.map((p) => `${x(p.minute)},${y(p.winRate)}`).join(' ')}
                      fill="none"
                      className="stroke-primary"
                      strokeWidth={2}
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                ))}
              </svg>
              <span className="absolute top-1.5 left-2 text-caption text-text-muted">Win rate by purchase minute</span>
            </div>
          </>
        )}

        <div className="relative h-16 text-right text-caption text-text-muted" aria-hidden="true">
          <span className="absolute right-0 bottom-0">Buys</span>
        </div>
        <div className="relative h-16 overflow-hidden rounded-sm border border-border bg-surface-sunken">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 size-full animate-fade-in">
            {typical && <rect x={(typical.from / xMax) * 100} width={((typical.to - typical.from) / xMax) * 100} y={0} height={100} className="fill-primary/10" />}
            {shown.map((p) => {
              const h = (p.share / maxShare) * 92
              return <rect key={p.minute} x={x(p.minute) - 40 / xMax} width={80 / xMax} y={100 - h} height={h} className="fill-steel" />
            })}
          </svg>
        </div>

        <div aria-hidden="true" />
        <div className="relative h-5 text-caption text-text-muted tabular" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className="absolute -translate-x-1/2 first:translate-x-0" style={{ left: `${(t / xMax) * 100}%` }}>
              {t}m
            </span>
          ))}
        </div>
      </div>

      <figcaption className="text-caption text-text-muted">
        {summary} Line: win rate of players who bought the item in that minute, with its 95% interval (band); minutes with fewer than{' '}
        {formatInteger(SAMPLE_TIER_THRESHOLDS.moderate)} purchases are left out. Dashed line: 50%. Bars: share of purchases per minute; shaded: the middle half of
        purchases.
      </figcaption>

      <details className="text-sm">
        <summary className="cursor-pointer py-3 font-ui font-semibold text-primary hover:text-highlight">Show data</summary>
        <div className="mt-2 max-h-72 overflow-y-auto rounded-sm border border-border">
          <table className="w-full font-ui text-sm">
            <caption className="sr-only">Purchases and win rate by purchase minute, the values behind the chart</caption>
            <thead className="sticky top-0 bg-surface text-eyebrow">
              <tr>
                <th scope="col" className="px-3 py-2 text-left">Minute</th>
                <th scope="col" className="px-3 py-2 text-right">Purchases</th>
                <th scope="col" className="px-3 py-2 text-right">Win rate</th>
                <th scope="col" className="hidden px-3 py-2 text-right sm:table-cell">95% interval</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.minute} className="border-t border-border">
                  <td className="px-3 py-1.5 text-text-muted tabular">
                    {p.minute}–{p.minute + 1}
                  </td>
                  <td className="px-3 py-1.5 text-right text-text tabular">
                    {formatInteger(p.matches)} <span className="text-text-muted">({formatPercent(p.share)})</span>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular">
                    {p.sample === 'low' ? <span className="text-text-muted" title="Low sample">{formatPercent(p.winRate)}*</span> : <span className="text-text">{formatPercent(p.winRate)}</span>}
                  </td>
                  <td className="hidden px-3 py-1.5 text-right text-text-muted tabular sm:table-cell">
                    {formatPercent(p.interval.low)}–{formatPercent(p.interval.high)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-caption text-text-muted">* Fewer than {formatInteger(SAMPLE_TIER_THRESHOLDS.moderate)} purchases (Low sample): not drawn.</p>
      </details>
    </InView>
  )
}
