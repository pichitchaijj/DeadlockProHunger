import type { Metadata } from 'next'
import Link from 'next/link'
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
import { BuildListCard } from '@/features/builds/components/BuildListCard'
import { HeroSelect } from '@/features/builds/components/HeroSelect'
import { getBuildsListing } from '@/features/builds/loaders'
import { LABEL_TEXT } from '@/features/builds/model'
import { buildsHref, CATEGORIES, parseBuildsQuery, type BuildsQuery } from '@/features/builds/query'
import { slugify } from '@/features/meta/model'
import { rankBandOptions } from '@/features/meta/rankFilter'
import { resolveScope } from '@/features/meta/scope'
import { DataNotice } from '@/components/data/DataState'
import { attempt } from '@/lib/deadlock/errors'

export const metadata: Metadata = {
  title: 'Builds',
  description: 'Deadlock builds with measured win rates: meta builds, builds by top-ranked players, and community favorites.',
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const WINDOWS = [
  ['patch', 'Current patch'],
  ['7d', '7 days'],
  ['30d', '30 days'],
] as const

/** The shell (categories, filters) renders immediately; results stream in. */
export default async function BuildsPage({ searchParams }: { searchParams: SearchParams }) {
  const query = parseBuildsQuery(await searchParams)
  const [heroes, scope] = await Promise.all([
    getActiveHeroes()
      .then((list) => list.map((h) => ({ slug: slugify(h.name), name: h.name })).sort((a, b) => a.name.localeCompare(b.name)))
      .catch(() => []),
    resolveScope({ window: query.window, rank: query.rank, mode: 'all' }).catch(() => null),
  ])
  const category = CATEGORIES.find((c) => c.id === query.category)!
  const heroName = heroes.find((h) => h.slug === query.hero)?.name

  return (
    <PageContainer className="flex flex-col gap-8">
      <SectionHeader
        as="h1"
        eyebrow="Builds"
        title="Builds"
        description="Win rates count matches where a build was selected at game start. Labels only appear when the data meets their rule."
      />

      <nav aria-label="Build categories" className="border-b border-border">
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
                  {c.label}
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
        />
        <div className="grid gap-5 lg:grid-cols-2">
          <Filter label="Patch / time (for win rates)" value={query.window} options={WINDOWS.map(([value, label]) => ({ value, label, href: buildsHref(query, { window: value }) }))} />
          {scope && (
            <Filter label="Rank (match average)" value={query.rank} options={rankBandOptions(scope.rankLabels, scope.ranks, (rank) => buildsHref(query, { rank }))} />
          )}
        </div>
      </div>

      <section aria-labelledby="list-title" className="flex flex-col gap-4">
        <div>
          <h2 id="list-title" className="font-display text-display-m font-bold text-text uppercase">
            {category.label}
            {heroName && <span className="text-text-muted"> · {heroName}</span>}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-text-muted">{category.definition}</p>
        </div>
        <Suspense key={buildsHref(query)} fallback={<ResultsSkeleton />}>
          <BuildsResults query={query} />
        </Suspense>
      </section>

      <details className="rounded-md border border-border bg-surface-sunken px-(--spacing-card) py-4 text-sm text-text-muted">
        <summary className="cursor-pointer py-3 font-ui font-semibold text-text">How builds are labeled</summary>
        <ul className="mt-3 flex flex-col gap-1.5">
          {Object.values(LABEL_TEXT).map((l) => (
            <li key={l.text}>
              <span className="font-semibold text-text">{l.text}</span>: {l.rule}.
            </li>
          ))}
          <li>Win rates count matches where the build was selected at game start; switching builds mid-match isn’t tracked.</li>
        </ul>
      </details>
    </PageContainer>
  )
}

async function BuildsResults({ query }: { query: BuildsQuery }) {
  const listingLoad = await attempt('[builds] listing failed', getBuildsListing(query))
  const listing = listingLoad.ok ? listingLoad.value : undefined
  const failed = listingLoad.ok ? 'unavailable' : listingLoad.kind

  if (listing === undefined) {
    return <DataNotice error={failed} what="Builds" action={<ButtonLink href={buildsHref(query)} variant="secondary" size="sm">Try again</ButtonLink>} />
  }
  if (listing === null) {
    return <EmptyState title="Unknown hero" action={<ButtonLink href={buildsHref(query, { hero: 'all' })} variant="secondary" size="sm">All heroes</ButtonLink>} />
  }
  if (listing.rows.length === 0) {
    return (
      <EmptyState
        title="No builds match"
        description={
          query.category === 'meta'
            ? 'No build has 200+ tracked matches in this scope. Try 30 days or all ranks.'
            : query.category === 'pro'
              ? `None of the ${listing.candidates} most-favorited builds here is by an author currently ranked Ascendant or Eternus.`
              : 'No builds found.'
        }
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

function ResultsSkeleton() {
  return (
    <LoadingState label="Loading builds">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-60" />
        ))}
      </div>
    </LoadingState>
  )
}
