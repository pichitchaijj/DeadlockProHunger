import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/Badge'
import { ErrorState } from '@/components/ui/States'
import type { DataErrorKind } from '@/lib/deadlock/errors'
import { formatRelativeTime } from '@/lib/format'

const MESSAGES: Record<DataErrorKind, { title: string; description: string }> = {
  'rate-limit': {
    title: 'Rate limited',
    description: 'The data source is limiting requests right now. This section fills in again within a few minutes; nothing is shown in its place.',
  },
  timeout: {
    title: 'Data source is slow',
    description: 'The data source didn’t answer in time. Try again shortly.',
  },
  invalid: {
    title: 'Unexpected data',
    description: 'The data source answered in a format we don’t recognize, so it isn’t shown rather than risk showing it wrong.',
  },
  'not-found': {
    title: 'Not available',
    description: 'The data source has no data for this right now.',
  },
  unavailable: {
    title: 'Data unavailable',
    description: 'The data source didn’t respond. It may be a temporary problem; try again shortly.',
  },
}

/** A section-level error that says what failed and why, without filling the gap with guesses. */
export function DataNotice({ error, what, action, className }: { error: DataErrorKind; what: string; action?: ReactNode; className?: string }) {
  const m = MESSAGES[error]
  return <ErrorState title={`${what}: ${m.title.toLowerCase()}`} description={m.description} action={action} className={className} />
}

/**
 * When the data was computed, and a "Stale" flag once it's older than its freshness budget
 * (the cache keeps serving the last good value while the source is failing).
 */
export function Freshness({ asOf, stale, className }: { asOf: number; stale: boolean; className?: string }) {
  return (
    <p className={className ?? 'flex flex-wrap items-center gap-2 text-caption text-text-muted'}>
      <span>
        Updated <time dateTime={new Date(asOf).toISOString()}>{formatRelativeTime(asOf)}</time>
      </span>
      {stale && (
        <Badge tone="warning" title="The data source hasn’t refreshed this in longer than usual. Showing the last good data.">
          Stale
        </Badge>
      )}
    </p>
  )
}
