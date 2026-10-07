import type { ReactNode } from 'react'
import { ConfidenceBadge } from '@/components/data/ConfidenceBadge'
import { InView } from '@/components/motion/InView'
import { Reveal } from '@/components/motion/Reveal'
import type { SampleScale } from '@/lib/analytics/sampleTier'
import { cx } from '@/lib/cx'
import { formatPercent } from '@/lib/format'
import { domainLabel, toPercent, winRateDomain } from '@/lib/scale'
import { clearlyHigher, type Difference, type Rate, type Side } from '../model'

/** Side colors are restrained and always paired with the side's name. */
export const SIDE_TEXT: Record<Side, string> = { a: 'text-primary', b: 'text-text-muted' }
export const SIDE_BG: Record<Side, string> = { a: 'bg-primary', b: 'bg-text-muted' }

export function Block({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-display text-title font-bold text-text uppercase">{title}</h2>
        {description && <p className="text-sm text-text-muted">{description}</p>}
      </div>
      {children}
    </section>
  )
}

/** Data-backed statements per side. Nothing is listed unless the data separates the sides. */
export function KeyDifferences({ differences, names, scope }: { differences: Difference[]; names: [string, string]; scope: string }) {
  return (
    <section aria-labelledby="key-diff" className="flex flex-col gap-3 rounded-md border border-primary/40 bg-surface p-(--spacing-card) shadow-glow">
      <h2 id="key-diff" className="font-display text-display-m font-bold text-text uppercase">Key differences</h2>
      {differences.length === 0 ? (
        <p className="text-sm text-text-muted">No clear differences in {scope}: every compared win-rate interval overlaps, and no other measure differs enough to call.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(['a', 'b'] as const).map((side, s) => {
            const mine = differences.filter((d) => d.side === side)
            return (
              <div key={side} className="flex flex-col gap-2">
                <h3 className={cx('font-ui text-sm font-semibold', SIDE_TEXT[side])}>{names[s]}</h3>
                {mine.length === 0 ? (
                  <p className="text-sm text-text-muted">No measure where {names[s]} is clearly ahead.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {mine.map((d, i) => (
                      <Reveal as="li" key={d.text} index={i} className="rounded-sm border border-border bg-surface-sunken px-3 py-2">
                        <p className="text-sm font-semibold text-text">{d.text}</p>
                        <p className="text-caption text-text-muted">{d.detail}</p>
                      </Reveal>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}
      <p className="text-caption text-text-muted">Listed only when the 95% intervals don’t overlap (win rates) or the gap is large (popularity). These describe measured results, not causes.</p>
    </section>
  )
}

/** One metric side by side; the clearly higher side is highlighted, otherwise “similar”. */
export function RateRow({ label, a, b, scale = 'population' }: { label: string; a: Rate | null; b: Rate | null; scale?: SampleScale }) {
  const winner = clearlyHigher(a, b)
  const cell = (r: Rate | null, side: Side) => (
    <div className={cx('flex flex-col gap-1 rounded-sm border px-3 py-2', winner === side ? 'border-primary/50 bg-primary/5' : 'border-border bg-surface-sunken')}>
      {r && r.matches > 0 ? (
        <>
          <span className={cx('font-display text-title font-bold tabular', r.sample === 'low' ? 'text-text-muted' : 'text-text')}>{formatPercent(r.winRate)}</span>
          <ConfidenceBadge sampleSize={r.matches} interval={r.interval} scale={scale} />
        </>
      ) : (
        <span className="text-sm text-text-muted">No data</span>
      )}
      {winner === side && <span className="text-caption font-semibold text-primary">Clearly higher</span>}
    </div>
  )
  return (
    <div className="grid grid-cols-[1fr_1fr] gap-2 sm:grid-cols-[9rem_1fr_1fr]">
      <span className="col-span-2 text-eyebrow sm:col-span-1 sm:self-center">{label}</span>
      {cell(a, 'a')}
      {cell(b, 'b')}
      {!winner && a && b && a.matches > 0 && b.matches > 0 && <span className="col-span-2 text-caption text-text-muted sm:col-start-2">Similar: intervals overlap or a sample is small.</span>}
    </div>
  )
}

/** A plain value side by side (no uncertainty), e.g. pick rate or favorites. */
export function ValueRow({ label, a, b, highlight }: { label: string; a: ReactNode; b: ReactNode; highlight?: Side | null }) {
  return (
    <div className="grid grid-cols-[1fr_1fr] gap-2 sm:grid-cols-[9rem_1fr_1fr]">
      <span className="col-span-2 text-eyebrow sm:col-span-1 sm:self-center">{label}</span>
      {([a, b] as const).map((v, i) => (
        <div key={i} className={cx('rounded-sm border px-3 py-2 font-ui text-sm text-text', highlight === (i === 0 ? 'a' : 'b') ? 'border-primary/50 bg-primary/5' : 'border-border bg-surface-sunken')}>
          {v}
        </div>
      ))}
    </div>
  )
}

/** Paired win-rate bars per group (match length, rank band) with interval whiskers. Bars grow in once. */
export function PairedBars({ groups, names }: { groups: Array<{ key: string; label: string; a: Rate | null; b: Rate | null }>; names: [string, string] }) {
  const values = groups.flatMap((g) => [g.a, g.b]).filter((r): r is Rate => Boolean(r && r.matches > 0)).flatMap((r) => [r.interval.low, r.interval.high])
  const domain = winRateDomain(values)
  return (
    <InView className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {groups.map((g, gi) => {
          const winner = clearlyHigher(g.a, g.b)
          return (
            <li key={g.key} className="grid grid-cols-[7rem_1fr] items-center gap-3 max-sm:grid-cols-[5.5rem_1fr]">
              <span className="text-sm leading-tight text-text-muted">{g.label}</span>
              <span className="flex flex-col gap-1">
                {(['a', 'b'] as const).map((side, si) => {
                  const r = g[side]
                  return (
                    <span key={side} className="grid grid-cols-[1fr_3.25rem] items-center gap-2">
                      <span aria-hidden="true" className="relative h-2 rounded-pill bg-surface-sunken">
                        <span className="absolute inset-y-[-3px] left-1/2 w-px bg-text-muted/40" />
                        {r && r.matches > 0 && (
                          <>
                            <span className={cx('absolute inset-y-0 left-0 origin-left animate-grow rounded-pill', SIDE_BG[side], r.sample === 'low' && 'opacity-40')} style={{ width: `${toPercent(r.winRate, domain)}%`, animationDelay: `${(gi * 2 + si) * 50}ms` }} />
                            <span className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-text/70" style={{ left: `${toPercent(r.interval.low, domain)}%`, width: `${Math.max(1, toPercent(r.interval.high, domain) - toPercent(r.interval.low, domain))}%` }} />
                          </>
                        )}
                      </span>
                      <span className={cx('text-right font-ui text-caption tabular', winner === side ? 'font-semibold text-primary' : 'text-text-muted')}>
                        {r && r.matches > 0 ? formatPercent(r.winRate) : '—'}
                      </span>
                      <span className="sr-only">
                        {names[si]} {g.label}: {r && r.matches > 0 ? `${formatPercent(r.winRate)} over ${r.matches} matches` : 'no data'}
                        {winner === side ? ', clearly higher' : ''}
                      </span>
                    </span>
                  )
                })}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-pill bg-primary" /> {names[0]}</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-pill bg-text-muted" /> {names[1]}</span>
        <span>Scale {domainLabel(domain)}, center line 50%, whisker = 95% interval; faded = low sample.</span>
      </p>
    </InView>
  )
}

/** Two daily win-rate lines on one small chart. */
export function DualSparkline({ a, b, names }: { a: number[]; b: number[]; names: [string, string] }) {
  if (a.length < 2 && b.length < 2) return <p className="text-sm text-text-muted">Not enough daily data to chart.</p>
  const W = 320
  const H = 80
  const all = [...a, ...b, 0.5]
  const min = Math.min(...all) - 0.01
  const max = Math.max(...all) + 0.01
  const path = (v: number[]) => v.map((x, i) => `${i === 0 ? 'M' : 'L'}${((i / Math.max(1, v.length - 1)) * (W - 8) + 4).toFixed(1)},${(4 + (1 - (x - min) / (max - min)) * (H - 8)).toFixed(1)}`).join(' ')
  const y50 = 4 + (1 - (0.5 - min) / (max - min)) * (H - 8)
  return (
    <InView as="figure" className="flex flex-col gap-1">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Daily win rate: ${names[0]} ${a.length ? `${formatPercent(a[0])} to ${formatPercent(a.at(-1)!)}` : 'no data'}; ${names[1]} ${b.length ? `${formatPercent(b[0])} to ${formatPercent(b.at(-1)!)}` : 'no data'}.`} className="h-auto w-full rounded-sm border border-border bg-surface-sunken">
        <line x1={4} x2={W - 4} y1={y50} y2={y50} className="stroke-text-muted/40" strokeDasharray="3 4" />
        {b.length > 1 && <path d={path(b)} data-draw pathLength={1} fill="none" className="stroke-text-muted" strokeWidth={1.75} />}
        {a.length > 1 && <path d={path(a)} data-draw pathLength={1} fill="none" className="stroke-primary" strokeWidth={1.75} />}
      </svg>
      <figcaption className="text-caption text-text-muted">Daily win rate across the window (dashed 50%). Days with too few matches are left out.</figcaption>
    </InView>
  )
}
