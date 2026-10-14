import { useLocale, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/Badge'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState, ErrorState } from '@/components/ui/States'
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
  forbidden: 'Access refused',
  'not-found': 'Not available',
  unavailable: 'Data unavailable',
  pending: 'Not prepared yet',
  limited: 'Default filters only',
}

const DESCRIPTION_KEY = {
  'rate-limit': 'rateLimit',
  timeout: 'timeout',
  invalid: 'invalid',
  forbidden: 'forbidden',
  'not-found': 'notFound',
  unavailable: 'unavailable',
  pending: 'pending',
  limited: 'limited',
} as const satisfies Record<DataErrorKind, string>

/**
 * A section-level error that says what failed and why, without filling the gap with guesses.
 * `pending` and `limited` aren't failures (nothing was requested: lib/deadlock/expensive.ts), so they render as a
 * neutral notice; for `limited`, `defaultHref` (the same view with the default filters) replaces the retry action,
 * which would only load the same limited view again.
 */
export function DataNotice({ error, what, action, defaultHref, className }: { error: DataErrorKind; what: string; action?: ReactNode; defaultHref?: string; className?: string }) {
  const t = useTranslations('errors.source')
  const title = `${what}: ${TITLES[error].toLowerCase()}`
  if (error === 'pending' || error === 'limited') {
    const next =
      error === 'limited'
        ? defaultHref && (
            <ButtonLink href={defaultHref} variant="secondary" size="sm">
              {t('useDefaultFilters')}
            </ButtonLink>
          )
        : action
    return <EmptyState title={title} description={t(DESCRIPTION_KEY[error])} action={next || undefined} className={className} />
  }
  return <ErrorState title={title} description={t(DESCRIPTION_KEY[error])} action={action} className={className} />
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
