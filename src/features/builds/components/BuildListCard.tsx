import Link from 'next/link'
import { WinRate } from '@/components/cards/WinRate'
import { ConfidenceBadge } from '@/components/data/ConfidenceBadge'
import { HeroPortrait } from '@/components/game-assets/HeroPortrait'
import { RankBadge } from '@/components/game-assets/RankBadge'
import { cx } from '@/lib/cx'
import { formatCompact, formatInteger, formatRelativeTime } from '@/lib/format'
import type { BuildRow } from '../loaders'
import { LABEL_TEXT, type BuildLabel, type PatchStatus } from '../model'

/** Data-backed labels. Each carries its rule as a tooltip and as screen-reader text. */
export function BuildLabels({ labels, className }: { labels: BuildLabel[]; className?: string }) {
  if (labels.length === 0) return null
  return (
    <ul aria-label="Build labels" className={cx('flex flex-wrap gap-1.5', className)}>
      {labels.map((label) => (
        <li
          key={label}
          title={LABEL_TEXT[label].rule}
          className={cx(
            'rounded-xs border px-1.5 py-0.5 font-ui text-caption font-semibold',
            label === 'best-performing' || label === 'high-performing' ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border-strong text-text-muted',
          )}
        >
          {LABEL_TEXT[label].text}
          <span className="sr-only">: {LABEL_TEXT[label].rule}</span>
        </li>
      ))}
    </ul>
  )
}

export function PatchNote({ status, updatedAt }: { status: PatchStatus; updatedAt: number | null }) {
  if (!updatedAt) return null
  return (
    <span className={cx('text-caption', status === 'older' ? 'text-orange' : 'text-text-muted')}>
      {status === 'current' ? 'Updated this patch' : status === 'older' ? 'Not updated since the current patch' : 'Updated'} · {formatRelativeTime(updatedAt)}
    </span>
  )
}

/** List card: hero, title, author, win rate, matches, patch status, confidence, labels. */
export function BuildListCard({ build }: { build: BuildRow }) {
  const low = build.stats?.sample === 'low'
  return (
    <article className="elevate relative flex h-full flex-col gap-3 rounded-md border border-border bg-surface p-(--spacing-card) shadow-card">
      <header className="flex items-start gap-3">
        <HeroPortrait name={build.hero.name} src={build.hero.iconUrl ?? undefined} size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-caption text-text-muted">{build.hero.name}</p>
          <h3 className="font-ui text-title leading-snug font-semibold text-text">
            <Link href={build.href} className="line-clamp-2 after:absolute after:inset-0 after:rounded-md hover:text-highlight">
              {build.name}
            </Link>
          </h3>
          <p className="truncate text-caption text-text-muted">
            {build.authorName ? `by ${build.authorName}` : 'Author unknown'}
            {build.authorRank && <> · <RankBadge rank={build.authorRank} size="xs" /></>}
          </p>
        </div>
      </header>

      <BuildLabels labels={build.labels} />

      <div className="mt-auto flex flex-col gap-2 border-t border-border pt-3">
        {build.stats ? (
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-end gap-4">
              <div>
                <p className="text-caption text-text-muted">Win rate</p>
                <WinRate value={build.stats.winRate} muted={low} />
              </div>
              <div>
                <p className="text-caption text-text-muted">Matches</p>
                <p className="font-ui text-sm font-semibold text-text tabular">{formatInteger(build.stats.matches)}</p>
              </div>
            </div>
            <ConfidenceBadge sampleSize={build.stats.matches} interval={build.stats.interval} />
          </div>
        ) : (
          <p className="text-caption text-text-muted">No tracked matches in this scope</p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <PatchNote status={build.patch} updatedAt={build.updatedAt} />
          {build.weeklyFavorites && <span className="text-caption text-text-muted tabular">{formatCompact(build.weeklyFavorites)} favorites/wk</span>}
        </div>
      </div>
    </article>
  )
}
