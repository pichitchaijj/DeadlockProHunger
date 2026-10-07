import { useLocale, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/Badge'
import { ErrorState } from '@/components/ui/States'
import type { DataErrorKind } from '@/lib/deadlock/errors'
import { formatRelativeTime } from '@/lib/format'

/*
 * The title reads "<what>: <status>", where `what` is page text ("Hero statistics") that pages still pass
 * in English. Until pages translate it, the whole title stays English rather than mixing two languages
 * in one sentence; the description is its own sentence and is translated (errors.source).
 */
const TITLES: Record<DataErrorKind, string> = {
  'rate-limit': 'Rate limited',
  timeout: 'Data source is slow',
  invalid: 'Unexpected data',
  'not-found': 'Not available',
  unavailable: 'Data unavailable',
}

const DESCRIPTION_KEY = {
  'rate-limit': 'rateLimit',
  timeout: 'timeout',
  invalid: 'invalid',
  'not-found': 'notFound',
  unavailable: 'unavailable',
} as const satisfies Record<DataErrorKind, string>

/** A section-level error that says what failed and why, without filling the gap with guesses. */
export function DataNotice({ error, what, action, className }: { error: DataErrorKind; what: string; action?: ReactNode; className?: string }) {
  const t = useTranslations('errors.source')
  return <ErrorState title={`${what}: ${TITLES[error].toLowerCase()}`} description={t(DESCRIPTION_KEY[error])} action={action} className={className} />
}

/**
 * When the data was computed, and a "Stale" flag once it's older than its freshness budget
 * (the cache keeps serving the last good value while the source is failing).
 */
export function Freshness({ asOf, stale, className }: { asOf: number; stale: boolean; className?: string }) {
  const t = useTranslations('data')
  const locale = useLocale()
  return (
    <p className={className ?? 'flex flex-wrap items-center gap-2 text-caption text-text-muted'}>
      <span>
        {t.rich('updated', {
          time: formatRelativeTime(asOf, undefined, locale),
          when: (chunks) => <time dateTime={new Date(asOf).toISOString()}>{chunks}</time>,
        })}
      </span>
      {stale && (
        <Badge tone="warning" title={t('staleTitle')}>
          {t('stale')}
        </Badge>
      )}
    </p>
  )
}
