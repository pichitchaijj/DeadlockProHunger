import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { OG_LOCALE } from '@/i18n/config'
import { pageAlternates } from '@/i18n/seo'
import { localePath } from '@/i18n/server'
import { Suspense } from 'react'
import { PageContainer } from '@/components/layout/PageContainer'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Filter } from '@/components/ui/Filter'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState, LoadingState } from '@/components/ui/States'
import { cx } from '@/lib/cx'
import { formatCompact } from '@/lib/format'
import { BuildCompareView, HeroCompareView, PlayerCompareView } from '@/features/compare/components/views'
import { buildOptions, getBuildCompare, getHeroCompare, getPlayerCompare, heroOptions } from '@/features/compare/loaders'
import { compareHref, parseCompareQuery, type CompareQuery } from '@/features/compare/query'
import { rankBandOptions } from '@/features/meta/rankFilter'
import { resolveScope } from '@/features/meta/scope'
import { DataNotice } from '@/components/data/DataState'
import { attempt } from '@/lib/deadlock/errors'
import { getScopeWording } from '@/components/data/scopeWording'

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations('compare.meta'), getLocale()])
  return {
    title: t('title'),
    description: t('description'),
    alternates: pageAlternates('/compare', locale),
    openGraph: { title: t('title'), description: t('description'), locale: OG_LOCALE[locale], type: 'website' },
  }
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const TYPES = ['heroes', 'builds', 'players'] as const

const fieldClass = 'h-11 w-full rounded-sm border border-border-control bg-surface-sunken px-3 font-ui text-sm text-text hover:border-text-muted focus-visible:border-primary'

export default async function ComparePage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams
  const query = parseCompareQuery(raw)
  const pickHero = typeof raw.pick === 'string' && /^[a-z0-9-]{1,40}$/.test(raw.pick) ? raw.pick : (query.a.split(':')[0] || '')
  const t = await getTranslations('compare')

  return (
    <PageContainer className="flex flex-col gap-8">
      <SectionHeader as="h1" eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
      <nav aria-label={t('types')} className="border-b border-border">
        <ul className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
          {TYPES.map((type) => (
            <li key={type} className="shrink-0">
              <Link
                href={`/compare?type=${type}`}
                aria-current={query.type === type ? 'page' : undefined}
                className={cx('relative flex h-11 items-center px-4 font-display text-[0.95rem] font-semibold tracking-[0.08em] uppercase', query.type === type ? 'text-text' : 'text-text-muted hover:text-text')}
              >
                {t(`typeLabels.${type}`)}
                <span aria-hidden="true" className={cx('absolute inset-x-3 bottom-0 h-0.5 bg-primary', query.type === type ? 'opacity-100' : 'opacity-0')} />
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <Pickers query={query} pickHero={pickHero} />

      {query.a && query.b ? (
        <Suspense key={compareHref(query)} fallback={<LoadingState label={t('loading')}><Skeleton className="h-[30rem]" /></LoadingState>}>
          <Comparison query={query} />
        </Suspense>
      ) : (
        <EmptyState
          title={t('empty.pickTitle')}
          description={query.type === 'players' ? t('empty.pickPlayers') : query.type === 'builds' ? t('empty.pickBuilds') : t('empty.pickHeroes')}
        />
      )}
    </PageContainer>
  )
}

async function Pickers({ query, pickHero }: { query: CompareQuery; pickHero: string }) {
  // GET forms submit to this page in the current locale.
  const [action, t, builds, locale] = await Promise.all([localePath('/compare'), getTranslations('compare.pickers'), getTranslations('builds'), getLocale()])
  if (query.type === 'players') {
    return (
      <form action={action} method="get" className="grid gap-4 rounded-md border border-border bg-surface/60 p-(--spacing-card) md:grid-cols-[1fr_1fr_auto] md:items-end">
        <input type="hidden" name="type" value="players" />
        {(['a', 'b'] as const).map((side) => (
          <label key={side} className="flex flex-col gap-1.5">
            <span className="text-eyebrow">{t('player', { side: side.toUpperCase() })}</span>
            <input name={side} defaultValue={query[side]} inputMode="numeric" pattern="\d{1,10}" placeholder={t('playerPlaceholder')} className={fieldClass} />
          </label>
        ))}
        <Button type="submit">{t('submit')}</Button>
        <p className="text-caption text-text-muted md:col-span-3">
          {t.rich('needId', { link: (chunks) => <Link href="/players" className="text-primary hover:text-highlight">{chunks}</Link> })}
        </p>
      </form>
    )
  }

  const [heroLoad, scope, scopeWords] = await Promise.all([attempt('[compare] hero list failed', heroOptions()), resolveScope({ window: query.window, rank: query.rank, mode: 'all' }).catch(() => null), getScopeWording()])
  // Hero and build comparisons both start from the hero list: without it, say why instead of showing empty pickers.
  if (!heroLoad.ok) return <DataNotice error={heroLoad.kind} what="Hero list" />
  const heroes = heroLoad.value
  const scopeFilters = scope && (
    <div className="grid gap-4 md:grid-cols-2">
      <Filter label={builds('detail.window')} value={query.window} options={(['patch', '7d', '30d'] as const).map((w) => ({ value: w, label: scopeWords.window(scope.windows[w], { short: true }), href: compareHref(query, { window: w }) }))} />
      <Filter label={builds('list.rank')} value={query.rank} options={rankBandOptions(scopeWords.rankLabels(scope.rankRefs), scope.ranks, (rank) => compareHref(query, { rank }))} />
    </div>
  )

  if (query.type === 'heroes') {
    return (
      <div className="flex flex-col gap-4 rounded-md border border-border bg-surface/60 p-(--spacing-card)">
        <form action={action} method="get" className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <input type="hidden" name="type" value="heroes" />
          {query.window !== '7d' && <input type="hidden" name="window" value={query.window} />}
          {query.rank !== 'all' && <input type="hidden" name="rank" value={query.rank} />}
          {(['a', 'b'] as const).map((side) => (
            <label key={side} className="flex flex-col gap-1.5">
              <span className="text-eyebrow">{t('hero', { side: side.toUpperCase() })}</span>
              <select name={side} defaultValue={query[side]} className={fieldClass}>
                <option value="">{t('choose')}</option>
                {heroes.map((h) => <option key={h.slug} value={h.slug}>{h.name}</option>)}
              </select>
            </label>
          ))}
          <Button type="submit">{t('submit')}</Button>
        </form>
        {scopeFilters}
      </div>
    )
  }

  // Builds: choose a hero, then set A and B from that hero's builds.
  const options = pickHero ? await buildOptions(pickHero).catch(() => []) : []
  return (
    <div className="flex flex-col gap-4 rounded-md border border-border bg-surface/60 p-(--spacing-card)">
      <form action={action} method="get" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="type" value="builds" />
        {query.a && <input type="hidden" name="a" value={query.a} />}
        {query.b && <input type="hidden" name="b" value={query.b} />}
        <label className="flex min-w-48 flex-col gap-1.5">
          <span className="text-eyebrow">{t('browseFor')}</span>
          <select name="pick" defaultValue={pickHero} className={fieldClass}>
            <option value="">{t('chooseHero')}</option>
            {heroes.map((h) => <option key={h.slug} value={h.slug}>{h.name}</option>)}
          </select>
        </label>
        <Button type="submit" variant="secondary">{t('showBuilds')}</Button>
      </form>
      {options.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-sm border border-border">
          {options.map((o) => (
            <li key={o.value} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-text">{o.name ?? t('untitledBuild')}</span>
              {o.favorites ? <span className="text-caption text-text-muted">{t('favoritesWeek', { count: formatCompact(o.favorites, locale) })}</span> : null}
              {(['a', 'b'] as const).map((side) => (
                <ButtonLink key={side} href={`${compareHref(query, { [side]: o.value })}&pick=${pickHero}`} size="sm" variant={query[side] === o.value ? 'primary' : 'secondary'} aria-pressed={query[side] === o.value}>
                  {t('set', { side: side.toUpperCase() })}
                </ButtonLink>
              ))}
            </li>
          ))}
        </ul>
      )}
      {scopeFilters}
    </div>
  )
}

type Loaded =
  | { kind: 'heroes'; data: Awaited<ReturnType<typeof getHeroCompare>> }
  | { kind: 'builds'; data: Awaited<ReturnType<typeof getBuildCompare>> }
  | { kind: 'players'; data: Awaited<ReturnType<typeof getPlayerCompare>> }

function load(query: CompareQuery): Promise<Loaded> {
  if (query.type === 'heroes') return getHeroCompare(query).then((data) => ({ kind: 'heroes', data }))
  if (query.type === 'builds') return getBuildCompare(query).then((data) => ({ kind: 'builds', data }))
  return getPlayerCompare(query).then((data) => ({ kind: 'players', data }))
}

async function Comparison({ query }: { query: CompareQuery }) {
  const t = await getTranslations('compare.empty')
  if (query.a === query.b) return <EmptyState title={t('sameTitle')} description={t('sameDescription')} />
  const result = await attempt('[compare] failed', load(query))
  const loaded = result.ok ? result.value : null
  const failed = result.ok ? 'unavailable' : result.kind
  if (!loaded) return <DataNotice error={failed} what="Comparison" />
  if (loaded.kind === 'heroes') return loaded.data ? <HeroCompareView data={loaded.data} /> : <EmptyState title={t('heroNotFound')} />
  if (loaded.kind === 'builds') return loaded.data ? <BuildCompareView data={loaded.data} /> : <EmptyState title={t('buildNotFound')} description={t('buildNotFoundDescription')} />
  return loaded.data ? <PlayerCompareView data={loaded.data} /> : <EmptyState title={t('playerNotFound')} description={t('playerNotFoundDescription')} />
}
