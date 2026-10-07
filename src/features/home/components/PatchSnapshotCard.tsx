import { Badge } from '@/components/ui/Badge'
import { ArrowRightIcon } from '@/components/ui/icons'
import { formatRelativeTime } from '@/lib/format'
import type { PatchSnapshot } from '../types'

const DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

/** Latest patch at a glance: date, the official post’s own preview, and how it sets the “current patch” window. */
export function PatchSnapshotCard({ patch }: { patch: PatchSnapshot | null }) {
  if (!patch) {
    return (
      <article className="rounded-md border border-border bg-surface p-(--spacing-card) shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="warning">Patch unknown</Badge>
        </div>
        <p className="mt-3 text-sm text-text">We couldn’t date the latest changelog, so “current patch” windows fall back to the last 7 days.</p>
        <p className="mt-1 text-caption text-text-muted">Statistics below are still real; they just aren’t split at a patch boundary.</p>
      </article>
    )
  }
  return (
    <article className="relative grid overflow-hidden rounded-md border border-border bg-surface shadow-card md:grid-cols-[1fr_1.3fr]">
      <div className="bg-tactical-grid relative flex flex-col justify-between gap-6 border-b border-border p-(--spacing-card) md:border-r md:border-b-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="primary">Current patch</Badge>
          <Badge>Changelog</Badge>
        </div>
        <div>
          <h3 className="font-display text-display-m font-bold text-text uppercase">{patch.title}</h3>
          <p className="mt-1 text-sm text-text-muted">
            <time dateTime={new Date(patch.publishedAt).toISOString()}>{DATE.format(patch.publishedAt)}</time>
            {' · '}
            {formatRelativeTime(patch.publishedAt)}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-(--spacing-card)">
        <h4 className="text-eyebrow">From the post</h4>
        {patch.excerpt ? (
          <blockquote className="border-l-2 border-primary/60 pl-3">
            <p className="font-ui text-sm font-semibold text-text">{patch.excerpt.headline}</p>
            {patch.excerpt.text && <p className="mt-1 text-sm text-text-muted">{patch.excerpt.text}</p>}
            <footer className="mt-1 text-caption text-text-muted">Excerpt from the official post’s preview; the full notes are on the forum.</footer>
          </blockquote>
        ) : (
          <p className="text-sm text-text-muted">The feed doesn’t include a preview of this post. Open it for the notes.</p>
        )}
        <p className="rounded-sm border border-border bg-surface-sunken px-3 py-2 text-caption text-text-muted">
          {patch.limitedData
            ? 'This patch is very recent, so “current patch” views have little post-patch data. Treat trends as early signals.'
            : '“Current patch” views on this site start on this date (from the changelog title).'}
        </p>
        {patch.link && (
          <a
            href={patch.link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-auto inline-flex items-center gap-1.5 self-start font-ui text-sm font-semibold text-primary hover:text-highlight pointer-coarse:min-h-11"
          >
            Read the changelog <ArrowRightIcon size={16} />
            <span className="sr-only">(opens the official forum in a new tab)</span>
          </a>
        )}
      </div>
    </article>
  )
}

