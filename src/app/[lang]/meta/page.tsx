import { DataNotice } from '@/components/data/DataState'
import type { Metadata } from 'next'
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
import { SAMPLE_TIER_THRESHOLDS } from '@/lib/analytics/sampleTier'
import { TIER_ORDER, TIER_RULES } from '@/lib/analytics/tiers'
import { formatInteger } from '@/lib/format'
import { MetaFilters } from '@/features/meta/components/MetaFilters'
import { MetaSummary } from '@/features/meta/components/MetaSummary'
import { MetaTable } from '@/features/meta/components/MetaTable'
import { TierBoard } from '@/features/meta/components/TierBoard'
import { WhyProvider, type WhyHero } from '@/features/meta/components/WhyPanel'
import { getMetaPageData } from '@/features/meta/loaders'
import { metaHref, parseMetaQuery } from '@/features/meta/query'

export const metadata: Metadata = {
  title: 'Meta',
  description: 'Which Deadlock heroes are strong right now, by rank and patch, with sample sizes and confidence.',
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function MetaPage({ searchParams }: { searchParams: SearchParams }) {
  const query = parseMetaQuery(await searchParams)
  const data = await getMetaPageData(query)

  if (!data.ok) {
    return (
      <PageContainer>
        <MetaHeader />
        <DataNotice className="mt-8" what="Meta" error={data.kind} action={<ButtonLink href={metaHref(query)} variant="secondary" size="sm">Try again</ButtonLink>} />
      </PageContainer>
    )
  }

  const { model, scope } = data
  const whyHeroes: WhyHero[] = model.heroes.map(({ slug, name, iconUrl, tier, sample, winRate, matches, interval, pickRate, trend, history, why }) => ({
    slug, name, iconUrl, tier, sample, winRate, matches, interval, pickRate, trend, history, why,
  }))

  return (
    <PageContainer className="flex flex-col gap-(--spacing-section)">
      <div className="flex flex-col gap-6">
        <MetaHeader />

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3 lg:max-w-3xl">
          <Counter label="Matches analyzed">
            <CountUp value={model.summary.matchesAnalyzed} format="compact" />
          </Counter>
          <Counter label="Heroes with enough data">
            <CountUp value={model.summary.heroesWithData} format="integer" />
            <span className="text-text-muted"> / {model.summary.heroesTotal}</span>
          </Counter>
          <Counter label="Patch age" className="col-span-2 sm:col-span-1">
            {data.patch ? (
              <>
                <CountUp value={data.patch.days} format="integer" />
                <span className="text-text-muted"> {data.patch.days === 1 ? 'day' : 'days'}</span>
              </>
            ) : (
              <span className="text-text-muted">Unknown</span>
            )}
          </Counter>
        </dl>

        {data.patch?.limited && query.window === 'patch' && (
          <p role="status" className="flex items-start gap-3 rounded-md border border-orange/40 bg-orange/10 px-4 py-3 text-sm text-text">
            <Badge tone="warning">New patch</Badge>
            The current patch is only {data.patch.days} {data.patch.days === 1 ? 'day' : 'days'} old. Expect small samples and treat tiers as early signals.
          </p>
        )}

        <MetaFilters query={query} windowLabels={data.windowLabels} rankLabels={data.rankLabels} ranks={data.ranks} rankShares={data.rankShares} />
        <ScopeLine scope={scope} />
      </div>

      <WhyProvider heroes={whyHeroes} scopeText={`${scope.windowLabel} · ${scope.rankLabel}`}>
        <section aria-labelledby="glance-title" className="flex flex-col gap-5">
          <SectionHeader id="glance-title" eyebrow="Layer 1" title="At a glance" description="The six answers most people need. Low-sample heroes are never used here." />
          <MetaSummary summary={model.summary} />
        </section>

        <section aria-labelledby="tiers-title" className="flex flex-col gap-5">
          <SectionHeader id="tiers-title" eyebrow="Layer 2" title="Tiers" description="Tiers come only from the win rate and how certain it is. Pick rate doesn’t change a tier." />
          <TierBoard tiers={model.tiers} />
          <HowTiersWork />
        </section>

        <section id="heroes-table" aria-labelledby="table-title" className="flex scroll-mt-24 flex-col gap-5">
          <SectionHeader
            id="table-title"
            eyebrow="Layer 3"
            title="All heroes"
            description="Sort any column. Open “Why?” for the numbers behind a hero."
          />
          {model.rows.length === 0 ? (
            <EmptyState
              title="No heroes to show"
              description="No hero in this role has enough matches in this scope. Try a longer window or a wider rank band."
              action={<ButtonLink href={metaHref(query, { window: '30d' })} variant="secondary" size="sm">Use last 30 days</ButtonLink>}
            />
          ) : (
            <MetaTable rows={model.rows} query={query} />
          )}
          {model.hiddenLowSample > 0 && (
            <p className="text-sm text-text-muted">
              {model.hiddenLowSample} {model.hiddenLowSample === 1 ? 'hero is' : 'heroes are'} hidden with fewer than{' '}
              {formatInteger(SAMPLE_TIER_THRESHOLDS.moderate)} matches.{' '}
              <Link href={metaHref(query, { showLow: true }, 'heroes-table')} className="font-semibold text-primary hover:text-highlight">
                Show them, muted
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
  return (
    <SectionHeader
      as="h1"
      eyebrow="Meta"
      title="Meta right now"
      description="What’s strong right now, how sure we are, and what’s changing. Start at the top; go deeper only if you need to."
    />
  )
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
  return (
    <details id="how-tiers-work" className="group rounded-md border border-border bg-surface-sunken px-(--spacing-card) py-4">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-ui text-sm font-semibold text-text [&::-webkit-details-marker]:hidden">
        How tiers, trends and confidence work
        <ChevronDownIcon size={16} className="text-text-muted transition-transform duration-(--dur-fast) group-open:rotate-180" />
      </summary>
      <div className="mt-4 grid gap-6 text-sm text-text-muted animate-awaken md:grid-cols-3">
        <div>
          <h3 className="mb-2 font-ui font-semibold text-text">Tiers</h3>
          <ul className="flex flex-col gap-1">
            {TIER_ORDER.map((tier) => (
              <li key={tier}>
                <span className="font-semibold text-text">{tier}</span>: {TIER_RULES[tier]}.
              </li>
            ))}
          </ul>
          <p className="mt-2">The interval is a 95% Wilson interval: the range the true win rate very likely falls in, given how many matches were played.</p>
        </div>
        <div>
          <h3 className="mb-2 font-ui font-semibold text-text">Trends</h3>
          <p>
            We compare the last 7 days with the 7 days before. A hero is “rising” or “falling” only when the two weeks’ intervals don’t overlap. Otherwise
            it’s “stable”, even if the number moved a little.
          </p>
        </div>
        <div>
          <h3 className="mb-2 font-ui font-semibold text-text">Confidence</h3>
          <p>
            Low: under {formatInteger(SAMPLE_TIER_THRESHOLDS.moderate)} matches (no tier, never in summaries). Moderate: up to{' '}
            {formatInteger(SAMPLE_TIER_THRESHOLDS.high)}. High: above that. Pick rate is the share of matches a hero appears in.
          </p>
        </div>
      </div>
    </details>
  )
}
