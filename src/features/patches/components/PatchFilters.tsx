import type { ReactNode } from 'react'
import { Filter } from '@/components/ui/Filter'
import { SelectNav } from '@/components/ui/SelectNav'
import type { RankBandId } from '@/lib/analytics/rankBands'
import type { RankCatalog } from '@/lib/deadlock/rankAssets'
import { rankBandOptions } from '@/features/meta/rankFilter'
import type { PatchQuery } from '../query'

type Props = {
  query: PatchQuery
  href: (changes: Partial<PatchQuery>) => string
  heroes: Array<{ slug: string; name: string }>
  items: Array<{ slug: string; name: string }>
  rankLabels: Record<RankBandId, string>
  ranks: RankCatalog
  /** Patch pickers (detail: one; compare: A and B) rendered first. */
  children?: ReactNode
}

/** Patch filters: patch picker(s), hero and item selects (narrow the lists), rank band and match type (statistics). */
export function PatchFilters({ query, href, heroes, items, rankLabels, ranks, children }: Props) {
  const hrefs = (key: 'hero' | 'item', list: Array<{ slug: string }>) =>
    Object.fromEntries([['all', href({ [key]: 'all' })], ...list.map((o) => [o.slug, href({ [key]: o.slug })])])
  return (
    <div className="flex flex-col gap-5 rounded-md border border-border bg-surface/60 p-(--spacing-card)">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {children}
        <SelectNav label="Hero" allLabel="All heroes" options={heroes.map((h) => ({ value: h.slug, label: h.name }))} value={query.hero} hrefFor={hrefs('hero', heroes)} />
        <SelectNav label="Item" allLabel="All items" options={items.map((i) => ({ value: i.slug, label: i.name }))} value={query.item} hrefFor={hrefs('item', items)} />
      </div>
      <Filter label="Rank (match average, for statistics)" value={query.rank} options={rankBandOptions(rankLabels, ranks, (rank) => href({ rank }))} />
      <div className="grid gap-5 md:grid-cols-2">
        <Filter
          label="Match type"
          value={query.mode}
          options={[
            { value: 'all', label: 'Ranked + unranked', href: href({ mode: 'all' }) },
            { value: 'ranked', label: 'Ranked only', href: href({ mode: 'ranked' }) },
          ]}
        />
        <div className="flex flex-col gap-2">
          <span className="text-eyebrow">Game mode</span>
          <p className="text-sm text-text-muted">Normal (6v6). The statistics source covers Street Brawl separately; it isn’t shown here.</p>
        </div>
      </div>
    </div>
  )
}
