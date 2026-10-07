import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { PageContainer } from '@/components/layout/PageContainer'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Filter } from '@/components/ui/Filter'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState, LoadingState } from '@/components/ui/States'
import { RANK_BANDS } from '@/lib/analytics/rankBands'
import { cx } from '@/lib/cx'
import { formatCompact } from '@/lib/format'
import { BuildCompareView, HeroCompareView, PlayerCompareView } from '@/features/compare/components/views'
import { buildOptions, getBuildCompare, getHeroCompare, getPlayerCompare, heroOptions } from '@/features/compare/loaders'
import { compareHref, parseCompareQuery, type CompareQuery } from '@/features/compare/query'
import { resolveScope } from '@/features/meta/scope'
import { DataNotice } from '@/components/data/DataState'
import { attempt } from '@/lib/deadlock/errors'

export const metadata: Metadata = {
  title: 'Compare',
  description: 'Compare Deadlock heroes, builds or players side by side. Differences are stated only when the data supports them.',
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const TYPES = [
  ['heroes', 'Hero vs hero'],
  ['builds', 'Build vs build'],
  ['players', 'Player vs player'],
] as const

const fieldClass = 'h-11 w-full rounded-sm border border-border-control bg-surface-sunken px-3 font-ui text-sm text-text hover:border-text-muted focus-visible:border-primary'

export default async function ComparePage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams
  const query = parseCompareQuery(raw)
  const pickHero = typeof raw.pick === 'string' && /^[a-z0-9-]{1,40}$/.test(raw.pick) ? raw.pick : (query.a.split(':')[0] || '')

  return (
    <PageContainer className="flex flex-col gap-8">
      <SectionHeader as="h1" eyebrow="Compare" title="Compare" description="Side by side, with key differences first. A difference is only stated when the data separates the two sides." />
      <nav aria-label="Comparison types" className="border-b border-border">
        <ul className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
          {TYPES.map(([type, label]) => (
            <li key={type} className="shrink-0">
              <Link
                href={`/compare?type=${type}`}
                aria-current={query.type === type ? 'page' : undefined}
                className={cx('relative flex h-11 items-center px-4 font-display text-[0.95rem] font-semibold tracking-[0.08em] uppercase', query.type === type ? 'text-text' : 'text-text-muted hover:text-text')}
              >
                {label}
                <span aria-hidden="true" className={cx('absolute inset-x-3 bottom-0 h-0.5 bg-primary', query.type === type ? 'opacity-100' : 'opacity-0')} />
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <Pickers query={query} pickHero={pickHero} />

      {query.a && query.b ? (
        <Suspense key={compareHref(query)} fallback={<LoadingState label="Loading comparison"><Skeleton className="h-[30rem]" /></LoadingState>}>
          <Comparison query={query} />
        </Suspense>
      ) : (
        <EmptyState
          title="Pick two to compare"
          description={query.type === 'players' ? 'Enter two SteamID3s (find them via player search).' : query.type === 'builds' ? 'Choose a hero, then set build A and build B.' : 'Choose two heroes.'}
        />
      )}
    </PageContainer>
  )
}

async function Pickers({ query, pickHero }: { query: CompareQuery; pickHero: string }) {
  if (query.type === 'players') {
    return (
      <form action="/compare" method="get" className="grid gap-4 rounded-md border border-border bg-surface/60 p-(--spacing-card) md:grid-cols-[1fr_1fr_auto] md:items-end">
        <input type="hidden" name="type" value="players" />
        {(['a', 'b'] as const).map((side) => (
          <label key={side} className="flex flex-col gap-1.5">
            <span className="text-eyebrow">Player {side.toUpperCase()} (SteamID3)</span>
            <input name={side} defaultValue={query[side]} inputMode="numeric" pattern="\d{1,10}" placeholder="e.g. 338104565" className={fieldClass} />
          </label>
        ))}
        <Button type="submit">Compare</Button>
        <p className="text-caption text-text-muted md:col-span-3">Need an ID? <Link href="/players" className="text-primary hover:text-highlight">Search players</Link> and copy it from their profile.</p>
      </form>
    )
  }

  const [heroLoad, scope] = await Promise.all([attempt('[compare] hero list failed', heroOptions()), resolveScope({ window: query.window, rank: query.rank, mode: 'all' }).catch(() => null)])
  // Hero and build comparisons both start from the hero list: without it, say why instead of showing empty pickers.
  if (!heroLoad.ok) return <DataNotice error={heroLoad.kind} what="Hero list" />
  const heroes = heroLoad.value
  const scopeFilters = scope && (
    <div className="grid gap-4 md:grid-cols-2">
      <Filter label="Patch / time" value={query.window} options={(['patch', '7d', '30d'] as const).map((w) => ({ value: w, label: scope.windowLabels[w].replace(/ \(since .*\)/, ''), href: compareHref(query, { window: w }) }))} />
      <Filter label="Rank (match average)" value={query.rank} options={RANK_BANDS.map((b) => ({ value: b.id, label: scope.rankLabels[b.id], href: compareHref(query, { rank: b.id }) }))} />
    </div>
  )

  if (query.type === 'heroes') {
    return (
      <div className="flex flex-col gap-4 rounded-md border border-border bg-surface/60 p-(--spacing-card)">
        <form action="/compare" method="get" className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <input type="hidden" name="type" value="heroes" />
          {query.window !== '7d' && <input type="hidden" name="window" value={query.window} />}
          {query.rank !== 'all' && <input type="hidden" name="rank" value={query.rank} />}
          {(['a', 'b'] as const).map((side) => (
            <label key={side} className="flex flex-col gap-1.5">
              <span className="text-eyebrow">Hero {side.toUpperCase()}</span>
              <select name={side} defaultValue={query[side]} className={fieldClass}>
                <option value="">Choose…</option>
                {heroes.map((h) => <option key={h.slug} value={h.slug}>{h.name}</option>)}
              </select>
            </label>
          ))}
          <Button type="submit">Compare</Button>
        </form>
        {scopeFilters}
      </div>
    )
  }

  // Builds: choose a hero, then set A and B from that hero's builds.
  const options = pickHero ? await buildOptions(pickHero).catch(() => []) : []
  return (
    <div className="flex flex-col gap-4 rounded-md border border-border bg-surface/60 p-(--spacing-card)">
      <form action="/compare" method="get" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="type" value="builds" />
        {query.a && <input type="hidden" name="a" value={query.a} />}
        {query.b && <input type="hidden" name="b" value={query.b} />}
        <label className="flex min-w-48 flex-col gap-1.5">
          <span className="text-eyebrow">Browse builds for</span>
          <select name="pick" defaultValue={pickHero} className={fieldClass}>
            <option value="">Choose a hero…</option>
            {heroes.map((h) => <option key={h.slug} value={h.slug}>{h.name}</option>)}
          </select>
        </label>
        <Button type="submit" variant="secondary">Show builds</Button>
      </form>
      {options.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-sm border border-border">
          {options.map((o) => (
            <li key={o.value} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-text">{o.name}</span>
              {o.favorites ? <span className="text-caption text-text-muted">{formatCompact(o.favorites)} favorites/wk</span> : null}
              {(['a', 'b'] as const).map((side) => (
                <ButtonLink key={side} href={`${compareHref(query, { [side]: o.value })}&pick=${pickHero}`} size="sm" variant={query[side] === o.value ? 'primary' : 'secondary'} aria-pressed={query[side] === o.value}>
                  Set {side.toUpperCase()}
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
  if (query.a === query.b) return <EmptyState title="Pick two different ones" description="Both sides are the same." />
  const result = await attempt('[compare] failed', load(query))
  const loaded = result.ok ? result.value : null
  const failed = result.ok ? 'unavailable' : result.kind
  if (!loaded) return <DataNotice error={failed} what="Comparison" />
  if (loaded.kind === 'heroes') return loaded.data ? <HeroCompareView data={loaded.data} /> : <EmptyState title="Hero not found" />
  if (loaded.kind === 'builds') return loaded.data ? <BuildCompareView data={loaded.data} /> : <EmptyState title="Build not found" description="One of the builds isn’t available." />
  return loaded.data ? <PlayerCompareView data={loaded.data} /> : <EmptyState title="Player not found" description="One of the accounts has no public profile or stored matches." />
}
