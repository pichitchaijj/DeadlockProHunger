import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { Suspense } from 'react'
import { ScopeLine } from '@/components/data/ScopeLine'
import { PageContainer } from '@/components/layout/PageContainer'
import { Reveal } from '@/components/motion/Reveal'
import { ButtonLink } from '@/components/ui/Button'
import { Filter } from '@/components/ui/Filter'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState, LoadingState } from '@/components/ui/States'
import { cx } from '@/lib/cx'
import { getActiveHeroes } from '@/lib/deadlock/endpoints'
import { BuildListCard, buildLabelText } from '@/features/builds/components/BuildListCard'
import { HeroSelect } from '@/features/builds/components/HeroSelect'
import { getBuildsListing, PRO_MIN_TIER } from '@/features/builds/loaders'
import type { BuildLabel } from '@/features/builds/model'
import { buildsHref, CATEGORIES, parseBuildsQuery, type BuildsQuery } from '@/features/builds/query'
import { slugify } from '@/features/meta/model'
import { rankBandOptions } from '@/features/meta/rankFilter'
import { resolveScope } from '@/features/meta/scope'
import { DataNotice } from '@/components/data/DataState'
import { OG_LOCALE } from '@/i18n/config'
import { attempt } from '@/lib/deadlock/errors'

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations('builds.meta'), getLocale()])
  return {
    title: t('listTitle'),
    description: t('listDescription'),
    openGraph: { title: t('listTitle'), description: t('listDescription'), locale: OG_LOCALE[locale], type: 'website' },
  }
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const WINDOWS = ['patch', '7d', '30d'] as const

/** Rank names are API data: the Pro rule names the tiers from the rank feed (English names if it's unavailable). */
const proRanks = (tierNames: Map<number, string> | undefined) => ({
  rankA: tierNames?.get(PRO_MIN_TIER) ?? 'Ascendant',
  rankB: tierNames?.get(PRO_MIN_TIER + 1) ?? 'Eternus',
})

/** The shell (categories, filters) renders immediately; results stream in. */
export default async function BuildsPage({ searchParams }: { searchParams: SearchParams }) {
  const query = parseBuildsQuery(await searchParams)
  const [heroes, scope, t] = await Promise.all([
    getActiveHeroes()
      .then((list) => list.map((h) => ({ slug: slugify(h.name), name: h.name })).sort((a, b) => a.name.localeCompare(b.name)))
      .catch(() => []),
    resolveScope({ window: query.window, rank: query.rank, mode: 'all' }).catch(() => null),
    getTranslations('builds'),
  ])
  const heroName = heroes.find((h) => h.slug === query.hero)?.name
  const ranks = proRanks(scope?.tierNames)
  const labelText = buildLabelText(t)

  return (
    <PageContainer className="flex flex-col gap-8">
      <SectionHeader as="h1" eyebrow={t('list.eyebrow')} title={t('list.title')} description={t('list.description')} />

      <nav aria-label={t('list.categoriesNav')} className="border-b border-border">
        <ul className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
          {CATEGORIES.map((c) => {
            const active = c.id === query.category
            return (
              <li key={c.id} className="shrink-0">
                <Link
                  href={buildsHref(query, { category: c.id })}
                  scroll={false}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'relative flex h-12 items-center px-4 font-display text-[0.95rem] font-semibold tracking-[0.08em] uppercase',
                    active ? 'text-text' : 'text-text-muted hover:text-text',
                  )}
                >
                  {t(`list.categories.${c.id}.label`)}
                  <span aria-hidden="true" className={cx('absolute inset-x-3 bottom-0 h-0.5 bg-primary', active ? 'opacity-100' : 'opacity-0')} />
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="grid gap-5 rounded-md border border-border bg-surface/60 p-(--spacing-card) md:grid-cols-[16rem_1fr]">
        <HeroSelect
          heroes={heroes}
          value={query.hero}
          hrefFor={Object.fromEntries([['all', buildsHref(query, { hero: 'all' })], ...heroes.map((h) => [h.slug, buildsHref(query, { hero: h.slug })])])}
          label={t('list.hero')}
          allLabel={t('list.allHeroes')}
        />
        <div className="grid gap-5 lg:grid-cols-2">
          <Filter label={t('list.window')} value={query.window} options={WINDOWS.map((value) => ({ value, label: t(`list.windows.${value}`), href: buildsHref(query, { window: value }) }))} />
          {scope && (
            <Filter label={t('list.rank')} value={query.rank} options={rankBandOptions(scope.rankLabels, scope.ranks, (rank) => buildsHref(query, { rank }))} />
          )}
        </div>
      </div>

      <section aria-labelledby="list-title" className="flex flex-col gap-4">
        <div>
          <h2 id="list-title" className="font-display text-display-m font-bold text-text uppercase">
            {t(`list.categories.${query.category}.label`)}
            {heroName && <span className="text-text-muted"> · {heroName}</span>}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-text-muted">{t(`list.categories.${query.category}.definition`, ranks)}</p>
        </div>
        <Suspense key={buildsHref(query)} fallback={<ResultsSkeleton label={t('list.loading')} />}>
          <BuildsResults query={query} ranks={ranks} />
        </Suspense>
      </section>

      <details className="rounded-md border border-border bg-surface-sunken px-(--spacing-card) py-4 text-sm text-text-muted">
        <summary className="cursor-pointer py-3 font-ui font-semibold text-text">{t('list.howLabeled')}</summary>
        <ul className="mt-3 flex flex-col gap-1.5">
          {(Object.keys(labelText) as BuildLabel[]).map((key) => (
            <li key={key}>
              {t.rich('list.labelRule', { label: labelText[key].text, rule: labelText[key].rule, term: (chunks) => <span className="font-semibold text-text">{chunks}</span> })}
            </li>
          ))}
          <li>{t('list.selectionNote')}</li>
        </ul>
      </details>
    </PageContainer>
  )
}

async function BuildsResults({ query, ranks }: { query: BuildsQuery; ranks: { rankA: string; rankB: string } }) {
  const [listingLoad, t, common] = await Promise.all([attempt('[builds] listing failed', getBuildsListing(query)), getTranslations('builds.list'), getTranslations('common')])
  const listing = listingLoad.ok ? listingLoad.value : undefined
  const failed = listingLoad.ok ? 'unavailable' : listingLoad.kind

  if (listing === undefined) {
    return <DataNotice error={failed} what="Builds" action={<ButtonLink href={buildsHref(query)} variant="secondary" size="sm">{common('tryAgain')}</ButtonLink>} />
  }
  if (listing === null) {
    return <EmptyState title={t('unknownHero')} action={<ButtonLink href={buildsHref(query, { hero: 'all' })} variant="secondary" size="sm">{t('allHeroes')}</ButtonLink>} />
  }
  if (listing.rows.length === 0) {
    return (
      <EmptyState
        title={t('noMatchTitle')}
        description={query.category === 'meta' ? t('noMatchMeta') : query.category === 'pro' ? t('noMatchPro', { count: listing.candidates, ...ranks }) : t('noMatchCommunity')}
      />
    )
  }
  return (
    <>
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {listing.rows.map((build, i) => (
          <Reveal as="li" key={build.id} index={i}>
            <BuildListCard build={build} />
          </Reveal>
        ))}
      </ul>
      <ScopeLine scope={listing.statScope} />
    </>
  )
}

function ResultsSkeleton({ label }: { label: string }) {
  return (
    <LoadingState label={label}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-60" />
        ))}
      </div>
    </LoadingState>
  )
}
