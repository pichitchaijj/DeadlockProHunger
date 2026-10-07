import { useLocale, useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/Badge'
import { ArrowRightIcon } from '@/components/ui/icons'
import { dateFormat, formatRelativeTime } from '@/lib/format'
import type { PatchSnapshot } from '../types'

const DATE: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }

/** Latest patch at a glance: date, the official post’s own preview, and how it sets the “current patch” window. */
export function PatchSnapshotCard({ patch }: { patch: PatchSnapshot | null }) {
  const t = useTranslations('home.patch')
  const locale = useLocale()
  if (!patch) {
    return (
      <article className="rounded-md border border-border bg-surface p-(--spacing-card) shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="warning">{t('unknown')}</Badge>
        </div>
        <p className="mt-3 text-sm text-text">{t('unknownText')}</p>
        <p className="mt-1 text-caption text-text-muted">{t('unknownNote')}</p>
      </article>
    )
  }
  return (
    <article className="relative grid overflow-hidden rounded-md border border-border bg-surface shadow-card md:grid-cols-[1fr_1.3fr]">
      <div className="bg-tactical-grid relative flex flex-col justify-between gap-6 border-b border-border p-(--spacing-card) md:border-r md:border-b-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="primary">{t('current')}</Badge>
          <Badge>{t('changelog')}</Badge>
        </div>
        <div>
          <h3 className="font-display text-display-m font-bold text-text uppercase">{patch.title}</h3>
          <p className="mt-1 text-sm text-text-muted">
            <time dateTime={new Date(patch.publishedAt).toISOString()}>{dateFormat(locale, DATE).format(patch.publishedAt)}</time>
            {' · '}
            {formatRelativeTime(patch.publishedAt, undefined, locale)}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-(--spacing-card)">
        <h4 className="text-eyebrow">{t('fromPost')}</h4>
        {patch.excerpt ? (
          <blockquote className="border-l-2 border-primary/60 pl-3">
            <p className="font-ui text-sm font-semibold text-text">{patch.excerpt.headline}</p>
            {patch.excerpt.text && <p className="mt-1 text-sm text-text-muted">{patch.excerpt.text}</p>}
            <footer className="mt-1 text-caption text-text-muted">{t('excerptNote')}</footer>
          </blockquote>
        ) : (
          <p className="text-sm text-text-muted">{t('noPreview')}</p>
        )}
        <p className="rounded-sm border border-border bg-surface-sunken px-3 py-2 text-caption text-text-muted">
          {patch.limitedData ? t('limited') : t('window')}
        </p>
        {patch.link && (
          <a
            href={patch.link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-auto inline-flex items-center gap-1.5 self-start font-ui text-sm font-semibold text-primary hover:text-highlight pointer-coarse:min-h-11"
          >
            {t('read')} <ArrowRightIcon size={16} />
            <span className="sr-only">{t('newTab')}</span>
          </a>
        )}
      </div>
    </article>
  )
}

