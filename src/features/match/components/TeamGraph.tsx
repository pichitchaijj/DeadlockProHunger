import { useLocale, useTranslations } from 'next-intl'
import { InView } from '@/components/motion/InView'
import { cx } from '@/lib/cx'
import { formatCompact, formatDuration } from '@/lib/format'
import { teamName } from '../text'
import { TEAM_STROKE } from './sections'

const W = 640
const H = 220
// Axis labels are HTML around the SVG (SVG text would shrink to ~6px on phones).
const PAD = { top: 12, right: 8, bottom: 4, left: 4 }

/**
 * Two team lines over the recorded samples, drawn in once (CSS). Includes a text
 * summary and a data table so the chart is never the only way to read the values. Match Detail only (matches.graph).
 */
export function TeamGraph({ title, times, series, unit }: { title: string; times: number[]; series: [number[], number[]]; unit: 'souls' | 'kills' }) {
  const t = useTranslations('matches')
  const locale = useLocale()
  const compact = (v: number) => formatCompact(v, locale)
  const max = Math.max(1, ...series.flat())
  const end = times.at(-1) || 1
  const x = (t: number) => PAD.left + (t / end) * (W - PAD.left - PAD.right)
  const y = (v: number) => PAD.top + (1 - v / max) * (H - PAD.top - PAD.bottom)
  const path = (values: number[]) => values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(times[i]).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const summary = t('graph.summary', { title, a: compact(series[0].at(-1) ?? 0), unit: t(`graph.units.${unit}`), b: compact(series[1].at(-1) ?? 0) })

  return (
    <InView as="figure" className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-eyebrow">{title}</span>
        <span className="flex gap-3 text-caption text-text-muted">
          <span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-primary" /> {teamName(t, 0)}</span>
          <span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-text-muted" /> {teamName(t, 1)}</span>
        </span>
      </figcaption>
      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-1.5">
        <div aria-hidden="true" className="relative">
          {[0.5, 1].map((f) => (
            <span key={f} className="absolute right-0 -translate-y-1/2 text-caption text-text-muted tabular" style={{ top: `${(y(max * f) / H) * 100}%` }}>{compact(max * f)}</span>
          ))}
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="h-auto w-full">
          {[0.5, 1].map((f) => (
            <line key={f} x1={PAD.left} x2={W - PAD.right} y1={y(max * f)} y2={y(max * f)} className="stroke-border" />
          ))}
          <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} className="stroke-steel" />
          {([0, 1] as const).map((side) => (
            <path key={side} d={path(series[side])} data-draw pathLength={1} fill="none" className={cx(TEAM_STROKE[side])} strokeWidth={2} strokeLinejoin="round" style={{ animationDelay: `${side * 150}ms` }} />
          ))}
        </svg>
        <div aria-hidden="true" className="relative col-start-2 h-5">
          {times.map((t, i) => (
            // Phones show every other tick so labels never collide; the first and last always show.
            <span key={t} className={cx('absolute top-1 -translate-x-1/2 text-caption whitespace-nowrap text-text-muted tabular', i % 2 === 1 && i !== times.length - 1 && 'max-sm:hidden', i === 0 && 'translate-x-0', i === times.length - 1 && '-translate-x-full')} style={{ left: `${(x(t) / W) * 100}%` }}>
              {formatDuration(t)}
            </span>
          ))}
        </div>
      </div>
      <details className="text-caption">
        <summary className="cursor-pointer py-3.5 font-ui font-semibold text-primary hover:text-highlight">{t('graph.showValues')}</summary>
        <table className="mt-2 w-full font-ui">
          <caption className="sr-only">{t('graph.caption', { title })}</caption>
          <thead className="text-text-muted">
            <tr>
              <th scope="col" className="py-1 text-left">{t('graph.time')}</th>
              <th scope="col" className="py-1 text-right">{teamName(t, 0)}</th>
              <th scope="col" className="py-1 text-right">{teamName(t, 1)}</th>
            </tr>
          </thead>
          <tbody>
            {times.map((t, i) => (
              <tr key={t} className="border-t border-border">
                <td className="py-1 text-text-muted tabular">{formatDuration(t)}</td>
                <td className="py-1 text-right text-text tabular">{compact(series[0][i])}</td>
                <td className="py-1 text-right text-text tabular">{compact(series[1][i])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </InView>
  )
}
