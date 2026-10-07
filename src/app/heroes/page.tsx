import type { Metadata } from 'next'
import { ScopeLine } from '@/components/data/ScopeLine'
import { PageContainer } from '@/components/layout/PageContainer'
import { ButtonLink } from '@/components/ui/Button'
import { SectionHeader } from '@/components/ui/SectionHeader'

import { HeroDirectory } from '@/features/heroes/components/HeroDirectory'
import { getDirectoryData } from '@/features/heroes/loaders'
import { heroesHref, parseScope, parseView } from '@/features/heroes/query'
import { DataNotice } from '@/components/data/DataState'

export const metadata: Metadata = {
  title: 'Heroes',
  description: 'Find any Deadlock hero fast: search, filter by role and complexity, and compare win rate, pick rate and trend.',
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function HeroesPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams
  const scope = parseScope(raw)
  const view = parseView(raw)
  const data = await getDirectoryData(scope)

  return (
    <PageContainer className="flex flex-col gap-8">
      <SectionHeader
        as="h1"
        eyebrow="Heroes"
        title="Hero directory"
        description="Find a hero fast. Numbers use the same rules as the Meta page: low samples are muted and trends need non-overlapping intervals."
      />
      {data.ok ? (
        <>
          <HeroDirectory heroes={data.heroes} scope={scope} initialView={view} windowLabels={data.windowLabels} rankLabels={data.rankLabels} />
          <ScopeLine scope={data.scope} />
        </>
      ) : (
        <DataNotice error={data.kind} what="Hero directory" action={<ButtonLink href={heroesHref(scope, view)} variant="secondary" size="sm">Try again</ButtonLink>} />
      )}
    </PageContainer>
  )
}
