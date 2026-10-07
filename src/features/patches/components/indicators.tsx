import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { cx } from '@/lib/cx'
import { formatPercent, formatPointDelta } from '@/lib/format'
import type { Mark, Verdict } from '../model'

const MARKS: Record<Mark, { tone: BadgeTone; icon: string; label: string }> = {
  buff: { tone: 'positive', icon: '▲', label: 'Buff' },
  nerf: { tone: 'negative', icon: '▼', label: 'Nerf' },
  changed: { tone: 'warning', icon: '●', label: 'Changed' },
  mixed: { tone: 'neutral', icon: '◆', label: 'Mixed' },
  new: { tone: 'primary', icon: '+', label: 'New' },
  removed: { tone: 'neutral', icon: '−', label: 'Removed' },
}

/** Buff / nerf / changed marker: a word and a symbol, never color alone. */
export function DirectionBadge({ mark, className }: { mark: Mark; className?: string }) {
  const m = MARKS[mark]
  return (
    <Badge tone={m.tone} className={className} icon={<span aria-hidden="true">{m.icon}</span>}>
      {m.label}
    </Badge>
  )
}

/** "28s → 24s" with the new value emphasized; read as "from 28s to 24s". */
export function BeforeAfter({ before, after, className }: { before: string; after: string; className?: string }) {
  return (
    <span className={cx('inline-flex flex-wrap items-baseline gap-x-1.5 tabular', className)}>
      <span className="sr-only">from</span>
      <span className="text-text-muted line-through decoration-text-muted/50">{before}</span>
      <span aria-hidden="true" className="text-text-muted">
        →
      </span>
      <span className="sr-only">to</span>
      <span className="font-semibold text-text">{after}</span>
    </span>
  )
}

/** Percentage-point change with sign and arrow (color is secondary). */
export function PointDelta({ delta, muted = false }: { delta: number | null; muted?: boolean }) {
  if (delta === null) return <span className="text-text-muted">—</span>
  const up = delta > 0
  const flat = Math.abs(delta) < 0.0005
  return (
    <span className={cx('font-ui font-semibold tabular', muted || flat ? 'text-text-muted' : up ? 'text-positive' : 'text-negative')}>
      <span aria-hidden="true">{flat ? '' : up ? '▲ ' : '▼ '}</span>
      {formatPointDelta(delta)}
    </span>
  )
}

/** "48.2% → 51.4%", or "—" for a missing side. */
export function RateChange({ before, after }: { before: number | null; after: number | null }) {
  return <BeforeAfter before={before === null ? '—' : formatPercent(before)} after={after === null ? '—' : formatPercent(after)} />
}

const VERDICTS: Record<Verdict, { tone: BadgeTone; icon: string; label: string }> = {
  higher: { tone: 'positive', icon: '▲', label: 'Higher' },
  lower: { tone: 'negative', icon: '▼', label: 'Lower' },
  'no clear change': { tone: 'neutral', icon: '', label: 'No clear change' },
  'not enough data': { tone: 'neutral', icon: '', label: 'Not enough data' },
}

/** Whether a win-rate move passes the clear-change rule (CLEAR_RULE). */
export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const v = VERDICTS[verdict]
  return (
    <Badge tone={v.tone} icon={v.icon ? <span aria-hidden="true">{v.icon}</span> : undefined}>
      {v.label}
    </Badge>
  )
}
