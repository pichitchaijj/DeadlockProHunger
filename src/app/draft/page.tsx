import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { PageContainer } from '@/components/layout/PageContainer'
import { ButtonLink } from '@/components/ui/Button'
import { Filter } from '@/components/ui/Filter'
import { SectionHeader } from '@/components/ui/SectionHeader'

import { rankBandOptions } from '@/features/meta/rankFilter'
import { HeroPicker, TeamSlots } from '@/features/draft/components/Board'
import { Balance, Recommendations, RoleCoverage, WeakPoints } from '@/features/draft/components/Insights'
import { RelationMap } from '@/features/draft/components/RelationMap'
import { getDraftData } from '@/features/draft/loaders'
import { draftHref, parseDraftQuery, TEAM_SIZE } from '@/features/draft/query'
import { DataNotice } from '@/components/data/DataState'
import { attempt } from '@/lib/deadlock/errors'

export const metadata: Metadata = {
  title: 'Draft Lab',
  description: 'Explore Deadlock team compositions: measured synergy, matchups, role coverage and data-backed next picks with confidence levels.',
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function Panel({ id, title, description, children, className }: { id: string; title: string; description?: string; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={`flex flex-col gap-3 rounded-md border border-border bg-surface/60 p-(--spacing-card) ${className ?? ''}`}>
      <div>
        <h2 id={id} className="font-display text-title font-bold text-text uppercase">{title}</h2>
        {description && <p className="text-sm text-text-muted">{description}</p>}
      </div>
      {children}
    </section>
  )
}

export default async function DraftPage({ searchParams }: { searchParams: SearchParams }) {
  const query = parseDraftQuery(await searchParams)
  const dataLoad = await attempt('[draft] load failed', getDraftData(query))
  const data = dataLoad.ok ? dataLoad.value : null
  const failed = dataLoad.ok ? 'unavailable' : dataLoad.kind

  return (
    <PageContainer className="flex flex-col gap-6">
      <SectionHeader
        as="h1"
        eyebrow="Advanced tool"
        title="Draft Lab"
        description="Pick heroes for both teams to see how they have performed together and against each other in public matches. These are statistical associations, not coaching: players, lanes and items matter and aren’t captured here."
      />
      {!data ? (
        <DataNotice error={failed} what="Draft data" action={<ButtonLink href={draftHref(query)} variant="secondary" size="sm">Try again</ButtonLink>} />
      ) : (
        <>
          <div className="grid gap-4 rounded-md border border-border bg-surface/60 p-(--spacing-card) md:grid-cols-2">
            <Filter label="Patch / time" value={query.window} options={(['patch', '7d', '30d'] as const).map((w) => ({ value: w, label: data.windowLabels[w].replace(/ \(since .*\)/, ''), href: draftHref(query, { window: w }) }))} />
            <Filter label="Rank (match average)" value={query.rank} options={rankBandOptions(data.rankLabels, data.ranks, (rank) => draftHref(query, { rank }))} />
          </div>

          <TeamSlots query={query} allies={data.allies} enemies={data.enemies} base={data.baseWinRate} />
          <HeroPicker query={query} heroes={data.heroes} />
          <p className="text-caption text-text-muted">Scope: {data.scopeText}. Numbers under heroes are their win rates in this scope.</p>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Panel id="relations" title="Relationships" description="Pairs whose results differ clearly from what each hero’s own win rate predicts.">
              {data.allies.length + data.enemies.length < 2 ? (
                <p className="text-sm text-text-muted">Pick at least two heroes.</p>
              ) : (
                <RelationMap allies={data.allies} enemies={data.enemies} relations={data.relations.clear} checked={data.relations.checked} withData={data.relations.withData} />
              )}
            </Panel>
            <Panel id="recs" title="Next pick for your team" description="Heroes with clear positive results alongside your picks or against the enemy’s. Ordered by confidence, then by measured gap.">
              <Recommendations query={query} recs={data.recommendations} heroes={data.heroes} hasPicks={data.allies.length + data.enemies.length > 0} alliesFull={data.allies.length >= TEAM_SIZE} />
            </Panel>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Panel id="weak" title="Weak points" description="Measured, for your team.">
              <WeakPoints points={data.weakPoints} hasAllies={data.allies.length > 0} />
            </Panel>
            <Panel id="roles" title="Role coverage">
              <RoleCoverage allies={data.allies} enemies={data.enemies} />
            </Panel>
            <Panel id="balance" title="Damage / frontline balance">
              <Balance allies={data.balance.allies} enemies={data.balance.enemies} />
            </Panel>
          </div>

          <p className="text-caption text-text-muted">
            How it works: each pair’s win rate is compared with the expectation from the two heroes’ individual win rates (same team: wr₁ + wr₂ − 50%; opposing: wr₁ − wr₂ + 50%). A relationship counts only when its 95% interval excludes that expectation, the gap is at least 1 percentage point, and it has 200+ matches. Pairs need 100+ matches to appear at all.
          </p>
        </>
      )}
    </PageContainer>
  )
}
