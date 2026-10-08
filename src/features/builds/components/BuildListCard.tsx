import { useLocale, useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import type { Locale } from '@/i18n/config'
import { WinRate } from '@/components/cards/WinRate'
import { ConfidenceBadge } from '@/components/data/ConfidenceBadge'
import { HeroPortrait } from '@/components/game-assets/HeroPortrait'
import { RankBadge } from '@/components/game-assets/RankBadge'
import { cx } from '@/lib/cx'
import { formatCompact, formatInteger, formatRelativeTime } from '@/lib/format'
import type { BuildRow } from '../loaders'
import { LABEL_TEXT, type BuildLabel, type PatchStatus } from '../model'

/*
 * BuildLabels and PatchNote are shared with pages that aren't localized yet (Compare), so they don't
 * translate themselves: without `text` / `labels` they stay English. The Builds pages pass their
 * translations (buildLabelText / patchLabels below).
 */

type BuildsT = ReturnType<typeof useTranslations<'builds'>>
export type LabelText = Record<BuildLabel, { text: string; rule: string }>
export type PatchLabels = { current: string; older: string; updated: string }

const LABEL_KEYS = {
  'best-performing': 'bestPerforming',
  'high-performing': 'highPerforming',
  'frequently-used': 'frequentlyUsed',
  popular: 'popular',
  'high-confidence': 'highConfidence',
} as const satisfies Record<BuildLabel, string>

/** The build labels and their rules in the active locale (builds.labels). */
export function buildLabelText(t: BuildsT): LabelText {
  const entry = (label: BuildLabel) => ({ text: t(`labels.${LABEL_KEYS[label]}.text`), rule: t(`labels.${LABEL_KEYS[label]}.rule`) })
  return Object.fromEntries((Object.keys(LABEL_KEYS) as BuildLabel[]).map((label) => [label, entry(label)])) as LabelText
}

export function patchLabels(t: BuildsT): PatchLabels {
  return { current: t('patch.current'), older: t('patch.older'), updated: t('patch.updated') }
}

/** Data-backed labels. Each carries its rule as a tooltip and as screen-reader text. */
export function BuildLabels({ labels, className, text = LABEL_TEXT, ariaLabel = 'Build labels' }: { labels: BuildLabel[]; className?: string; text?: LabelText; ariaLabel?: string }) {
  if (labels.length === 0) return null
  return (
    <ul aria-label={ariaLabel} className={cx('flex flex-wrap gap-1.5', className)}>
      {labels.map((label) => (
        <li
          key={label}
          title={text[label].rule}
          className={cx(
            'rounded-xs border px-1.5 py-0.5 font-ui text-caption font-semibold',
            label === 'best-performing' || label === 'high-performing' ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border-strong text-text-muted',
          )}
        >
          {text[label].text}
          <span className="sr-only">: {text[label].rule}</span>
        </li>
      ))}
    </ul>
  )
}

const PATCH_LABELS: PatchLabels = { current: 'Updated this patch', older: 'Not updated since the current patch', updated: 'Updated' }

/** `locale` formats the relative time; English when omitted. */
export function PatchNote({ status, updatedAt, labels = PATCH_LABELS, locale }: { status: PatchStatus; updatedAt: number | null; labels?: PatchLabels; locale?: Locale }) {
  if (!updatedAt) return null
  return (
    <span className={cx('text-caption', status === 'older' ? 'text-orange' : 'text-text-muted')}>
      {status === 'current' ? labels.current : status === 'older' ? labels.older : labels.updated} · {formatRelativeTime(updatedAt, undefined, locale)}
    </span>
  )
}

/** List card: hero, title, author, win rate, matches, patch status, confidence, labels. Builds page only. */
export function BuildListCard({ build }: { build: BuildRow }) {
  const t = useTranslations('builds')
  const cards = useTranslations('cards')
  const locale = useLocale()
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
            {build.authorName ? cards('byAuthor', { author: build.authorName }) : t('card.authorUnknown')}
            {build.authorRank && <> · <RankBadge rank={build.authorRank} size="xs" /></>}
          </p>
        </div>
      </header>

      <BuildLabels labels={build.labels} text={buildLabelText(t)} ariaLabel={t('labels.aria')} />

      <div className="mt-auto flex flex-col gap-2 border-t border-border pt-3">
        {build.stats ? (
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-end gap-4">
              <div>
                <p className="text-caption text-text-muted">{cards('winRate')}</p>
                <WinRate value={build.stats.winRate} muted={low} />
              </div>
              <div>
                <p className="text-caption text-text-muted">{t('card.matches')}</p>
                <p className="font-ui text-sm font-semibold text-text tabular">{formatInteger(build.stats.matches, locale)}</p>
              </div>
            </div>
            <ConfidenceBadge sampleSize={build.stats.matches} interval={build.stats.interval} />
          </div>
        ) : (
          <p className="text-caption text-text-muted">{t('card.noMatches')}</p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <PatchNote status={build.patch} updatedAt={build.updatedAt} labels={patchLabels(t)} locale={locale} />
          {build.weeklyFavorites && <span className="text-caption text-text-muted tabular">{t('card.favoritesPerWeek', { count: formatCompact(build.weeklyFavorites, locale) })}</span>}
        </div>
      </div>
    </article>
  )
}
