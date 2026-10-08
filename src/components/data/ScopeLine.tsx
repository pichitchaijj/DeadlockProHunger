import type { StatScope } from '@/lib/analytics/scope'
import { cx } from '@/lib/cx'
import { DemoDataBadge } from '@/components/ui/Badge'
import { useScopeWording } from './scopeWording'

/**
 * "Last 7 days · All ranks · n = 12,400" — the context every statistic must carry. Worded from the shared
 * scope catalog (scope.*) in the page's language; rank tier names are game data and pass through.
 */
export function ScopeLine({ scope, className }: { scope: StatScope; className?: string }) {
  const words = useScopeWording()
  return (
    <p className={cx('flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-text-muted', className)}>
      <span>{words.line(scope)}</span>
      {scope.source === 'snapshot' && scope.fetchedAt !== undefined && <span>{words.snapshot(scope.fetchedAt)}</span>}
      {scope.source === 'demo' && <DemoDataBadge />}
    </p>
  )
}
