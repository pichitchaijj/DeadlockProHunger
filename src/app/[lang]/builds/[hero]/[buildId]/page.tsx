import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import { notFound, redirect } from 'next/navigation'
import { Link } from '@/i18n/navigation'
import { OG_LOCALE, type Locale } from '@/i18n/config'
import { localePath } from '@/i18n/server'
import type { ReactNode } from 'react'
import { ScopeLine } from '@/components/data/ScopeLine'
import { HeroPortrait } from '@/components/game-assets/HeroPortrait'
import { PageContainer } from '@/components/layout/PageContainer'
import { CountUp } from '@/components/motion/CountUp'
import { ButtonLink } from '@/components/ui/Button'
import { RankBadge } from '@/components/game-assets/RankBadge'
import { Filter } from '@/components/ui/Filter'

import { cx } from '@/lib/cx'
import { formatDuration, formatInteger, formatPercent, formatPointDelta } from '@/lib/format'
import { BuildLabels, buildLabelText, PatchNote, patchLabels } from '@/features/builds/components/BuildListCard'
import { AbilityPlanGrid, FlowView, ItemRow, PerformanceCompare, PhaseColumns, TimingTable } from '@/features/builds/components/detail'
import { getBuildDetail } from '@/features/builds/loaders'
import type { BuildFact } from '@/features/builds/model'
import { buildDetailHref, buildsHref, DEFAULT_BUILDS_QUERY, parseBuildsQuery } from '@/features/builds/query'
import { AbilitySequence, Panel, type AbilityLabels } from '@/features/hero/components/parts'
import { ABILITY_PREFIX } from '@/features/hero/model'
import { rankBandOptions } from '@/features/meta/rankFilter'
import { resolveScope } from '@/features/meta/scope'
import { DataNotice } from '@/components/data/DataState'
import { attempt } from '@/lib/deadlock/errors'
import { getScopeWording } from '@/components/data/scopeWording'

type Params = Promise<{ hero: string; buildId: string }>
type SearchParams = Promise<Record<string, string | string[] | undefined>>

/** Title from the catalog; the hero name in the description comes from the URL slug (no extra fetch), as on Hero detail. */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { hero } = await params
  const name = hero
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
  const [t, locale] = await Promise.all([getTranslations('builds.meta'), getLocale()])
  const title = t('detailTitle')
  const description = t('detailDescription', { hero: name })
  return { title, description, openGraph: { title, description, locale: OG_LOCALE[locale], type: 'website' } }
}

const WINDOWS = ['patch', '7d', '30d'] as const

type WhyT = Awaited<ReturnType<typeof getTranslations<'builds.why'>>>

/** A measured fact (model) worded in the active locale. Names and numbers are data; only the sentence is UI text. */
function whyFact(fact: BuildFact, t: WhyT, ctx: { hero: string; scope: string; locale: Locale }): { label: string; text: string } {
  const n = (v: number) => formatInteger(v, ctx.locale)
  switch (fact.kind) {
    case 'popularity':
      return {
        label: t('popularity'),
        text: fact.rank ? t('popularityRankText', { favorites: n(fact.favorites), rank: fact.rank, total: fact.of, hero: ctx.hero }) : t('popularityText', { favorites: n(fact.favorites) }),
      }
    case 'no-matches':
      return { label: t('winRate'), text: t('noMatchesText', { scope: ctx.scope }) }
    case 'sample':
      return { label: t('sampleSize'), text: t('sampleText', { matches: n(fact.matches), scope: ctx.scope, sample: fact.sample, tracked: fact.tracked, hero: ctx.hero }) }
    case 'win-rate': {
      const range = { low: formatPercent(fact.interval.low), high: formatPercent(fact.interval.high), heroRate: formatPercent(fact.heroWinRate) }
      const comparison =
        fact.comparison === 'low' ? t('compareLow') : fact.comparison === 'above' ? t('compareAbove', range) : fact.comparison === 'below' ? t('compareBelow', range) : t('compareOverlap', range)
      return { label: t('winRate'), text: t('winRateText', { winRate: formatPercent(fact.winRate), delta: formatPointDelta(fact.winRate - fact.heroWinRate), hero: ctx.hero, comparison }) }
    }
    case 'timing':
      return {
        label: t('timing'),
        text: t('timingText', { timed: fact.timed, total: fact.total, hero: ctx.hero, core: fact.core, item: fact.last.name ?? '', time: formatDuration(fact.last.avgBuyTimeS!) }),
      }
    case 'flow':
      return { label: t('itemFlow'), text: t('flowText', { above: fact.above, total: fact.total, baseline: formatPercent(fact.baseline), hero: ctx.hero }) }
  }
}

export default async function BuildDetailPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { hero: heroSlug, buildId: rawId } = await params
  const query = parseBuildsQuery(await searchParams)
  const buildId = Number(rawId)
  if (!Number.isInteger(buildId) || buildId <= 0) notFound()

  const [detail, scope, t, why, parts, cards, common, locale] = await Promise.all([
    attempt('[build] detail failed', getBuildDetail(heroSlug, buildId, query)),
    resolveScope({ window: query.window, rank: query.rank, mode: 'all' }).catch(() => null),
    getTranslations('builds'),
    getTranslations('builds.why'),
    getTranslations('heroes.parts'),
    getTranslations('cards'),
    getTranslations('common'),
    getLocale(),
  ])
  const scopeWords = await getScopeWording()
  const data = detail.ok ? detail.value : undefined
  const failed = detail.ok ? 'unavailable' : detail.kind
  if (data === null) notFound()
  if (data?.kind === 'redirect') redirect(await localePath(data.href))
  if (!data) {
    return (
      <PageContainer>
        <h1 className="sr-only">{t('detail.fallbackTitle', { id: buildId })}</h1>
        <DataNotice error={failed} what="Build" action={<ButtonLink href={buildDetailHref(heroSlug, buildId, query)} variant="secondary" size="sm">{common('tryAgain')}</ButtonLink>} />
      </PageContainer>
    )
  }

  const { hero, build, stats } = data
  const timed = data.phases.phases.flatMap((p) => p.items)
  const delta = stats && data.heroWinRate !== null ? stats.winRate - data.heroWinRate : null
  // The shared ability grid (Hero detail's) takes its text from the caller; these are the Heroes translations of it.
  const abilityLabels: AbilityLabels = {
    region: parts('abilityOrder'),
    upgradeOrder: (steps) => parts('upgradeOrder', { steps }),
    ability: parts('ability'),
    unknownAbility: parts('unknownAbility'),
  }

  return (
    <PageContainer className="flex flex-col gap-10">
      {/* Header */}
      <section aria-labelledby="build-name" className="flex animate-awaken flex-col gap-5">
        <p className="text-eyebrow">
          <Link href={buildsHref({ ...DEFAULT_BUILDS_QUERY, ...query })} className="hover:text-text pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center">{t('list.title')}</Link>{' '}
          <span aria-hidden="true">/</span>{' '}
          <Link href={`/heroes/${hero.slug}`} className="hover:text-text">{hero.name}</Link>
        </p>
        <div className="flex flex-wrap items-start gap-4">
          <HeroPortrait name={hero.name} src={hero.iconUrl ?? undefined} size="lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <h1 id="build-name" className="font-display text-display-l font-extrabold text-text uppercase">{build.name}</h1>
            <p className="text-sm text-text-muted">
              {hero.name} · {build.authorName ? cards('byAuthor', { author: build.authorName }) : t('card.authorUnknown')}
              {build.authorRank && <> · <RankBadge rank={build.authorRank} size="xs" /></>}
              {build.version && ` · ${t('detail.version', { version: build.version })}`}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <PatchNote status={build.patch} updatedAt={build.updatedAt} labels={patchLabels(t)} locale={locale} />
              {build.weeklyFavorites && <span className="text-caption text-text-muted tabular">{cards('favoritesThisWeek', { count: formatInteger(build.weeklyFavorites, locale) })}</span>}
            </div>
            <BuildLabels labels={data.labels} text={buildLabelText(t)} ariaLabel={t('labels.aria')} />
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3 lg:max-w-3xl">
          <Stat label={t('detail.statWinRate')}>{stats ? <CountUp value={stats.winRate} format="percent" /> : <span className="text-text-muted">—</span>}</Stat>
          <Stat label={t('detail.statMatches')}>{stats ? <CountUp value={stats.matches} format="integer" /> : <span className="text-text-muted">0</span>}</Stat>
          <Stat label={t('detail.statVsHero', { hero: hero.name })} className="col-span-2 sm:col-span-1">
            {delta !== null ? <span className={cx(stats!.sample === 'low' && 'text-text-muted')}>{formatPointDelta(delta)}</span> : <span className="text-text-muted">—</span>}
          </Stat>
        </dl>

        <div className="grid gap-4 md:grid-cols-2">
          <Filter label={t('detail.window')} value={query.window} options={WINDOWS.map((value) => ({ value, label: t(`list.windows.${value}`), href: buildDetailHref(hero.slug, buildId, { ...query, window: value }) }))} />
          {scope && (
            <Filter label={t('list.rank')} value={query.rank} options={rankBandOptions(scopeWords.rankLabels(scope.rankRefs), scope.ranks, (rank) => buildDetailHref(hero.slug, buildId, { ...query, rank }))} />
          )}
        </div>
        <ScopeLine scope={{ ...data.statScope, sampleSize: stats?.matches }} />
      </section>

      {/* Why this build? */}
      <section aria-labelledby="why-build" className="flex flex-col gap-4">
        <div>
          <h2 id="why-build" className="font-display text-display-m font-bold text-text uppercase">{t('detail.whyTitle')}</h2>
          <p className="mt-1 max-w-3xl text-sm text-text-muted">{t('detail.whyDescription')}</p>
        </div>
        <dl className="grid gap-3 md:grid-cols-2">
          {data.why.map((fact) => {
            const { label, text } = whyFact(fact, why, { hero: hero.name, scope: scopeWords.scope(data.scopeRef), locale })
            return (
              <div key={fact.kind} className="rounded-md border border-border bg-surface p-4">
                <dt className="text-eyebrow">{label}</dt>
                <dd className="mt-1 text-sm text-text">{text}</dd>
              </div>
            )
          })}
          <div className="rounded-md border border-border bg-surface p-4">
            <dt className="text-eyebrow">{t('detail.rankScope')}</dt>
            <dd className="mt-1 text-sm text-text">{t('detail.rankScopeText', { scope: scopeWords.scope(data.scopeRef) })}</dd>
          </div>
        </dl>
      </section>

      <Panel title={t('detail.phasesTitle')} description={t('detail.phasesDescription')}>
        <PhaseColumns phases={data.phases.phases} untimed={data.phases.untimed} />
        {data.sections.length > 0 && (
          <details className="mt-5 border-t border-border pt-4">
            <summary className="cursor-pointer py-3 font-ui text-sm font-semibold text-primary hover:text-highlight">{t('detail.authorLayout', { count: data.sections.length })}</summary>
            <ol className="mt-3 flex flex-col gap-3">
              {data.sections.map((section) => (
                <li key={section.name} className="flex flex-col gap-1.5">
                  <span className="text-caption text-text-muted">{section.name}</span>
                  <ItemRow items={section.items} size={32} />
                </li>
              ))}
            </ol>
          </details>
        )}
      </Panel>

      {/* Full width: the author's plan has up to 16 steps. */}
      <div className="grid gap-4">
        <Panel title={t('detail.abilityTitle')} description={t('detail.abilityDescription')}>
          {data.plan.length > 0 ? <AbilityPlanGrid plan={data.plan} abilities={data.abilities} /> : <p className="text-sm text-text-muted">{t('detail.noPlan')}</p>}
          {data.opening && (
            <div className="mt-5 border-t border-border pt-4">
              <p className="mb-2 text-caption text-text-muted">
                {t('detail.openingComparison', { count: ABILITY_PREFIX, share: formatPercent(data.opening.share, 0), winRate: formatPercent(data.opening.winRate) })}
              </p>
              <AbilitySequence order={data.opening} abilities={data.abilities} labels={abilityLabels} />
            </div>
          )}
        </Panel>
        <Panel title={t('detail.performanceTitle')} description={t('detail.performanceDescription')}>
          {stats ? (
            <PerformanceCompare stats={stats} heroWinRate={data.heroWinRate} heroName={hero.name} />
          ) : (
            <p className="text-sm text-text-muted">{t('detail.noPerformance')}</p>
          )}
          <p className="mt-4 text-caption text-text-muted">{t('detail.trackedBuilds', { count: data.trackedBuilds, hero: hero.name })}</p>
        </Panel>
      </div>

      <Panel title={t('detail.timingTitle')} description={t('detail.timingDescription', { hero: hero.name })}>
        <TimingTable items={timed} />
      </Panel>

      <Panel title={t('detail.flowTitle')} description={t('detail.flowDescription')}>
        {data.flow && data.flow.items.length > 0 ? <FlowView flow={data.flow} /> : <p className="text-sm text-text-muted">{t('detail.noFlow')}</p>}
      </Panel>
    </PageContainer>
  )
}

function Stat({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col justify-between gap-1 bg-surface px-4 py-3', className)}>
      <dt className="text-eyebrow">{label}</dt>
      <dd className="font-display text-display-m font-bold text-text tabular">{children}</dd>
    </div>
  )
}
