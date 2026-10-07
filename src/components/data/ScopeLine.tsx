import type { StatScope } from '@/lib/analytics/scope'
import { formatInteger } from '@/lib/format'
import { cx } from '@/lib/cx'
import { DemoDataBadge } from '@/components/ui/Badge'

/** "Last 7 days · All ranks · n = 12,400" — the context every statistic must carry. */
export function ScopeLine({ scope, className }: { scope: StatScope; className?: string }) {
  const parts = [scope.windowLabel, scope.rankLabel]
  if (scope.sampleSize !== undefined) parts.push(`n = ${formatInteger(scope.sampleSize)}`)

  return (
    <p className={cx('flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-text-muted', className)}>
      <span>{parts.join(' · ')}</span>
      {scope.source === 'snapshot' && scope.fetchedAt !== undefined && (
        <span>· Data from {new Date(scope.fetchedAt).toUTCString().slice(5, 22)} UTC</span>
      )}
      {scope.source === 'demo' && <DemoDataBadge />}
    </p>
  )
}
