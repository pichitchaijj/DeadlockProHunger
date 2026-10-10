import type { Metadata } from 'next'
import { useTranslations } from 'next-intl'
import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { localePath } from '@/i18n/server'
import { OG_LOCALE, type Locale } from '@/i18n/config'
import { DataNotice } from '@/components/data/DataState'
import { PageContainer } from '@/components/layout/PageContainer'
import { Reveal } from '@/components/motion/Reveal'
import { Badge } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { cardClasses } from '@/components/ui/Card'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { EmptyState } from '@/components/ui/States'
import { cx } from '@/lib/cx'
import { attempt } from '@/lib/deadlock/errors'
import { DirectionBadge } from '@/features/patches/components/indicators'
import { patchList, patchNotes } from '@/features/patches/loaders'
import { noteCounts, type ChangeCounts, type PatchSummary } from '@/features/patches/model'
import { patchHref, patchListHref } from '@/features/patches/query'
import { patchDate, patchTitle, type PatchTranslate } from '@/features/patches/text'

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations('patch.meta'), getLocale()])
  return {
    title: t('listTitle'),
    description: t('listDescription'),
    openGraph: { title: t('listTitle'), description: t('listDescription'), locale: OG_LOCALE[locale], type: 'website' },
  }
}

export default async function PatchListPage() {
  const [load, t, common] = await Promise.all([attempt('[patch] list failed', patchList()), getTranslations('patch.list'), getTranslations('common')])

  return (
    <PageContainer className="flex flex-col gap-(--spacing-section)">
      <SectionHeader as="h1" eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
      {!load.ok ? (
        <DataNotice error={load.kind} what="Patches" action={<ButtonLink href={patchListHref()} variant="secondary" size="sm">{common('tryAgain')}</ButtonLink>} />
      ) : load.value.length === 0 ? (
        <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <PatchListContent patches={load.value} />
      )}
    </PageContainer>
  )
}

async function PatchListContent({ patches }: { patches: PatchSummary[] }) {
  // Notes are already in the (cached) feed; parsing is local, so counts cost no extra requests.
  const counts = await Promise.all(patches.map((p) => patchNotes(p).then((n) => (n ? noteCounts(n) : null)).catch(() => null)))
  const [t, compare, locale] = await Promise.all([getTranslations('patch'), getTranslations('compare.pickers'), getLocale()])
  const tr: PatchTranslate = (key, values) => t(key as 'untitled', values)
  const [latest, ...rest] = patches

  return (
    <>
      <section aria-labelledby="latest-title" className={cx(cardClasses({ accent: 'featured' }), 'flex flex-col gap-4 p-(--spacing-card)')}>
        <p className="text-eyebrow">{t('list.latest', { date: patchDate(latest.day, 'day', locale as Locale) })}</p>
        <h2 id="latest-title" className="font-display text-display-m font-bold text-text uppercase">
          {patchTitle(latest, tr)}
        </h2>
        <Counts counts={counts[0]} />
        <div className="flex flex-wrap gap-3">
          <ButtonLink href={patchHref(latest.id)} size="sm">
            {t('list.whatChanged')}
          </ButtonLink>
          {rest[0] && (
            <ButtonLink href={`/patch/compare?a=${rest[0].id}&b=${latest.id}`} variant="secondary" size="sm">
              {t('list.compareWithPrevious')}
            </ButtonLink>
          )}
        </div>
      </section>

      <section aria-labelledby="compare-title" className="flex flex-col gap-4 rounded-md border border-border bg-surface/60 p-(--spacing-card)">
        <h2 id="compare-title" className="font-ui text-title font-semibold text-text">
          {t('list.compareTitle')}
        </h2>
        {/* A plain GET form: works without JavaScript. */}
        <form action={await localePath('/patch/compare')} method="get" className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          {(
            [
              ['a', t('list.patchA'), rest[0]?.id ?? latest.id],
              ['b', t('list.patchB'), latest.id],
            ] as const
          ).map(([name, label, value]) => (
            <label key={name} className="flex min-w-0 flex-col gap-2">
              <span className="text-eyebrow">{label}</span>
              <select
                name={name}
                defaultValue={value}
                className="h-11 min-w-0 rounded-sm border border-border-control bg-surface-sunken px-3 font-ui text-sm text-text hover:border-text-muted focus-visible:border-primary"
              >
                {patches.map((p) => (
                  <option key={p.id} value={p.id}>
                    {t('option', { id: p.id, title: patchTitle(p, tr) })}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <Button type="submit">{compare('submit')}</Button>
        </form>
      </section>

      <section aria-labelledby="all-title" className="flex flex-col gap-4">
        <h2 id="all-title" className="font-display text-display-m font-bold text-text uppercase">
          {t('list.allTitle')}
        </h2>
        <ol className="flex flex-col gap-2.5">
          {patches.map((p, i) => (
            <Reveal as="li" key={p.id} index={Math.min(i, 8)}>
              <Link href={patchHref(p.id)} className={cx(cardClasses({ interactive: true }), 'group flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:gap-6')}>
                <time dateTime={p.id} className="w-28 shrink-0 font-ui text-sm text-text-muted tabular">
                  {patchDate(p.day, 'day', locale as Locale)}
                </time>
                <span className="min-w-0 flex-1">
                  <span className="block font-ui font-semibold text-text group-hover:text-highlight">{patchTitle(p, tr)}</span>
                  <Counts counts={counts[i]} compact />
                </span>
                <Badge tone={p.notesHtml ? 'primary' : 'neutral'}>{p.notesHtml ? t('list.notesIncluded') : t('list.notesLinked')}</Badge>
              </Link>
            </Reveal>
          ))}
        </ol>
        <p className="text-caption text-text-muted">{t('list.footnote', { count: patches.length })}</p>
      </section>
    </>
  )
}

function Counts({ counts, compact = false }: { counts: ChangeCounts | null; compact?: boolean }) {
  const t = useTranslations('patch.list')
  if (!counts) return <span className="block text-caption text-text-muted">{t('countsUnknown')}</span>
  return (
    <span className={cx('flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-muted', compact && 'mt-1 text-caption')}>
      <span>{t('counts', { heroes: counts.heroes, abilities: counts.abilities, items: counts.items })}</span>
      {!compact && (
        <span className="flex flex-wrap items-center gap-2">
          <DirectionBadge mark="buff" /> {counts.buffs}
          <DirectionBadge mark="nerf" /> {counts.nerfs}
          <DirectionBadge mark="changed" /> {counts.changed}
        </span>
      )}
    </span>
  )
}
