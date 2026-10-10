import { useTranslations } from 'next-intl'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { cx } from '@/lib/cx'
import { formatPercent, formatPointDelta } from '@/lib/format'
import type { Mark, Verdict } from '../model'
import { markLabel, verdictLabel } from '../text'

/** Marks are identifiers; their words come from the catalog (patch.marks). */
const MARKS: Record<Mark, { tone: BadgeTone; icon: string }> = {
  buff: { tone: 'positive', icon: '▲' },
  nerf: { tone: 'negative', icon: '▼' },
  changed: { tone: 'warning', icon: '●' },
  mixed: { tone: 'neutral', icon: '◆' },
  new: { tone: 'primary', icon: '+' },
  removed: { tone: 'neutral', icon: '−' },
}

/** Buff / nerf / changed marker: a word and a symbol, never color alone. */
export function DirectionBadge({ mark, className }: { mark: Mark; className?: string }) {
  const t = useTranslations('patch')
  const m = MARKS[mark]
  return (
    <Badge tone={m.tone} className={className} icon={<span aria-hidden="true">{m.icon}</span>}>
      {markLabel(mark, (key) => t(key as 'marks.buff'))}
    </Badge>
  )
}

/** "28s → 24s" with the new value emphasized; read as "from 28s to 24s". */
export function BeforeAfter({ before, after, className }: { before: string; after: string; className?: string }) {
  const t = useTranslations('patch.beforeAfter')
  return (
    <span className={cx('inline-flex flex-wrap items-baseline gap-x-1.5 tabular', className)}>
      <span className="sr-only">{t('from')}</span>
      <span className="text-text-muted line-through decoration-text-muted/50">{before}</span>
      <span aria-hidden="true" className="text-text-muted">
        →
      </span>
      <span className="sr-only">{t('to')}</span>
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

/** Verdicts are identifiers; their words come from the catalog (patch.verdicts). */
const VERDICTS: Record<Verdict, { tone: BadgeTone; icon: string }> = {
  higher: { tone: 'positive', icon: '▲' },
  lower: { tone: 'negative', icon: '▼' },
  'no clear change': { tone: 'neutral', icon: '' },
  'not enough data': { tone: 'neutral', icon: '' },
}

/** Whether a win-rate move passes the clear-change rule (patch.rules.clear). */
export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const t = useTranslations('patch')
  const v = VERDICTS[verdict]
  return (
    <Badge tone={v.tone} icon={v.icon ? <span aria-hidden="true">{v.icon}</span> : undefined}>
      {verdictLabel(verdict, (key) => t(key as 'verdicts.higher'))}
    </Badge>
  )
}
