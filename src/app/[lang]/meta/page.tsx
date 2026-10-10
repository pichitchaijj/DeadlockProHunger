import { DataNotice } from '@/components/data/DataState'
import type { Metadata } from 'next'
import { useLocale, useTranslations } from 'next-intl'
import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import type { ReactNode } from 'react'
import { ScopeLine } from '@/components/data/ScopeLine'
import { PageContainer } from '@/components/layout/PageContainer'
import { CountUp } from '@/components/motion/CountUp'
import { Badge } from '@/components/ui/Badge'
import { ButtonLink } from '@/components/ui/Button'
import { ChevronDownIcon } from '@/components/ui/icons'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { EmptyState } from '@/components/ui/States'
import { OG_LOCALE, type Locale } from '@/i18n/config'
import { pageAlternates } from '@/i18n/seo'
import { SAMPLE_TIER_THRESHOLDS } from '@/lib/analytics/sampleTier'
import { TIER_ORDER } from '@/lib/analytics/tiers'
import { formatInteger, formatPercent } from '@/lib/format'
import { MetaFilters } from '@/features/meta/components/MetaFilters'
import { MetaSummary } from '@/features/meta/components/MetaSummary'
import { MetaTable } from '@/features/meta/components/MetaTable'
import { TierBoard } from '@/features/meta/components/TierBoard'
import { WhyProvider, type WhyHero, type WhyLabels } from '@/features/meta/components/WhyPanel'
import { getMetaPageData } from '@/features/meta/loaders'
import { metaHref, parseMetaQuery } from '@/features/meta/query'
import { getMetaWhyWording } from '@/features/meta/wording'
import { getScopeWording } from '@/components/data/scopeWording'

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([getTranslations('meta.meta'), getLocale()])
  return {
    title: t('title'),
    description: t('description'),
    alternates: pageAlternates('/meta', locale),
    openGraph: { title: t('title'), description: t('description'), locale: OG_LOCALE[locale], type: 'website' },
  }
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function MetaPage({ searchParams }: { searchParams: SearchParams }) {
  const query = parseMetaQuery(await searchParams)
  const [data, t, common] = await Promise.all([getMetaPageData(query), getTranslations('meta'), getTranslations('common')])

  if (!data.ok) {
    return (
      <PageContainer>
        <MetaHeader />
        <DataNotice className="mt-8" what="Meta" error={data.kind} action={<ButtonLink href={metaHref(query)} variant="secondary" size="sm">{common('tryAgain')}</ButtonLink>} />
      </PageContainer>
    )
  }

  const { model, scope } = data
  const [words, why, list, locale] = await Promise.all([getScopeWording(), getMetaWhyWording(), getTranslations('heroes.list'), getLocale()])
  // The drawer is a client component: its words are prepared here, so no catalog reaches the browser.
  const whyHeroes: WhyHero[] = model.heroes.map(({ slug, name, iconUrl, tier, sample, winRate, matches, interval, pickRate, trend, history, why: facts }) => ({
    slug, name, iconUrl, tier, sample, winRate, matches, interval, pickRate, trend, history,
    why: facts.map(why.fact),
    title: t('panel.title', { hero: name }),
    historySummary: history.length > 1 ? t('panel.sparkline', { from: formatPercent(history[0]), to: formatPercent(history[history.length - 1]) }) : '',
  }))
  const whyLabels: WhyLabels = {
    why: t('panel.button'),
    winRate: t('table.winRate'),
    pickRate: list('pickRate'),
    daily: t('panel.daily'),
    trendComparison: list('comparison'),
    disclaimer: t('panel.disclaimer'),
    open: t('panel.open'),
  }

  return (
    <PageContainer className="flex flex-col gap-(--spacing-section)">
      <div className="flex flex-col gap-6">
        <MetaHeader />

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3 lg:max-w-3xl">
          <Counter label={t('counters.matches')}>
            <CountUp value={model.summary.matchesAnalyzed} format="compact" />
          </Counter>
          <Counter label={t('counters.heroes')}>
            <CountUp value={model.summary.heroesWithData} format="integer" />
            <span className="text-text-muted"> / {formatInteger(model.summary.heroesTotal, locale as Locale)}</span>
          </Counter>
          <Counter label={t('counters.patchAge')} className="col-span-2 sm:col-span-1">
            {data.patch ? (
              <>
                <CountUp value={data.patch.days} format="integer" />
                <span className="text-text-muted"> {t('counters.days', { count: data.patch.days })}</span>
              </>
            ) : (
              <span className="text-text-muted">{t('counters.unknown')}</span>
            )}
          </Counter>
        </dl>

        {data.patch?.limited && query.window === 'patch' && (
          <p role="status" className="flex items-start gap-3 rounded-md border border-orange/40 bg-orange/10 px-4 py-3 text-sm text-text">
            <Badge tone="warning">{t('patchNotice.badge')}</Badge>
            {t('patchNotice.text', { count: data.patch.days })}
          </p>
        )}

        <MetaFilters query={query} windowLabels={words.windowLabels(data.windows)} rankLabels={words.rankLabels(data.rankRefs)} ranks={data.ranks} rankShares={data.rankShares} />
        <ScopeLine scope={scope} />
      </div>

      <WhyProvider heroes={whyHeroes} scopeText={words.line({ window: scope.window, rank: scope.rank, ranked: scope.ranked })} labels={whyLabels}>
        <section aria-labelledby="glance-title" className="flex flex-col gap-5">
          <SectionHeader id="glance-title" eyebrow={t('layers.glance.eyebrow')} title={t('layers.glance.title')} description={t('layers.glance.description')} />
          <MetaSummary summary={model.summary} />
        </section>

        <section aria-labelledby="tiers-title" className="flex flex-col gap-5">
          <SectionHeader id="tiers-title" eyebrow={t('layers.tiers.eyebrow')} title={t('layers.tiers.title')} description={t('layers.tiers.description')} />
          <TierBoard tiers={model.tiers} />
          <HowTiersWork />
        </section>

        <section id="heroes-table" aria-labelledby="table-title" className="flex scroll-mt-24 flex-col gap-5">
          <SectionHeader id="table-title" eyebrow={t('layers.table.eyebrow')} title={t('layers.table.title')} description={t('layers.table.description')} />
          {model.rows.length === 0 ? (
            <EmptyState
              title={t('empty.title')}
              description={t('empty.description')}
              action={<ButtonLink href={metaHref(query, { window: '30d' })} variant="secondary" size="sm">{t('empty.action')}</ButtonLink>}
            />
          ) : (
            <MetaTable rows={model.rows} query={query} />
          )}
          {model.hiddenLowSample > 0 && (
            <p className="text-sm text-text-muted">
              {t('hiddenLow.text', { count: model.hiddenLowSample, threshold: formatInteger(SAMPLE_TIER_THRESHOLDS.moderate, locale as Locale) })}{' '}
              <Link href={metaHref(query, { showLow: true }, 'heroes-table')} className="font-semibold text-primary hover:text-highlight">
                {t('hiddenLow.show')}
              </Link>
            </p>
          )}
          <ScopeLine scope={scope} />
        </section>
      </WhyProvider>
    </PageContainer>
  )
}

function MetaHeader() {
  const t = useTranslations('meta.header')
  return <SectionHeader as="h1" eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
}

function Counter({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col justify-between gap-1 bg-surface px-4 py-3 sm:px-5 ${className ?? ''}`}>
      <dt className="text-eyebrow">{label}</dt>
      <dd className="font-display text-display-m font-bold text-text tabular">{children}</dd>
    </div>
  )
}

function HowTiersWork() {
  const t = useTranslations('meta.howTiers')
  const rules = useTranslations('data.tierRules')
  const locale = useLocale() as Locale
  return (
    <details id="how-tiers-work" className="group rounded-md border border-border bg-surface-sunken px-(--spacing-card) py-4">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-ui text-sm font-semibold text-text [&::-webkit-details-marker]:hidden">
        {t('summary')}
        <ChevronDownIcon size={16} className="text-text-muted transition-transform duration-(--dur-fast) group-open:rotate-180" />
      </summary>
      <div className="mt-4 grid gap-6 text-sm text-text-muted animate-awaken md:grid-cols-3">
        <div>
          <h3 className="mb-2 font-ui font-semibold text-text">{t('tiers')}</h3>
          <ul className="flex flex-col gap-1">
            {TIER_ORDER.map((tier) => (
              <li key={tier}>
                {t.rich('rule', { tier, rule: rules(tier), b: (chunks) => <span className="font-semibold text-text">{chunks}</span> })}
              </li>
            ))}
          </ul>
          <p className="mt-2">{t('interval')}</p>
        </div>
        <div>
          <h3 className="mb-2 font-ui font-semibold text-text">{t('trends')}</h3>
          <p>{t('trendsText')}</p>
        </div>
        <div>
          <h3 className="mb-2 font-ui font-semibold text-text">{t('confidence')}</h3>
          <p>
            {t('confidenceText', {
              moderate: formatInteger(SAMPLE_TIER_THRESHOLDS.moderate, locale),
              high: formatInteger(SAMPLE_TIER_THRESHOLDS.high, locale),
            })}
          </p>
        </div>
      </div>
    </details>
  )
}
