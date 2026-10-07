import { Filter } from '@/components/ui/Filter'
import type { RankBandId } from '@/lib/analytics/rankBands'
import type { RankCatalog } from '@/lib/deadlock/rankAssets'
import { HeroSelect } from '@/features/builds/components/HeroSelect'
import { capitalize } from '@/features/meta/model'
import type { MetaWindow } from '@/features/meta/query'
import { rankBandOptions } from '@/features/meta/rankFilter'
import { SLOTS, type ItemScopeQuery, type ItemSlot } from '../query'

const WINDOWS: Array<[MetaWindow, string]> = [
  ['patch', 'Current patch'],
  ['7d', '7 days'],
  ['30d', '30 days'],
]

type ItemFiltersProps = {
  query: ItemScopeQuery
  /** URL with some scope filters changed (the page decides list vs detail). */
  href: (changes: Partial<ItemScopeQuery>) => string
  heroes: Array<{ slug: string; name: string }>
  rankLabels: Record<RankBandId, string>
  ranks: RankCatalog
  /** Directory only. */
  slot?: { value: ItemSlot | 'all'; href: (slot: ItemSlot | 'all') => string }
}

/**
 * Item filters: the same window, rank band and match type as Meta, and the hero select from Builds.
 * All state is in the URL (links; only the hero select navigates with JS).
 */
export function ItemFilters({ query, href, heroes, rankLabels, ranks, slot }: ItemFiltersProps) {
  return (
    <div className="flex flex-col gap-5 rounded-md border border-border bg-surface/60 p-(--spacing-card)">
      <div className="grid gap-5 md:grid-cols-[16rem_1fr]">
        <HeroSelect heroes={heroes} value={query.hero} hrefFor={Object.fromEntries([['all', href({ hero: 'all' })], ...heroes.map((h) => [h.slug, href({ hero: h.slug })])])} />
        <div className="grid gap-5 lg:grid-cols-2">
          <Filter label="Patch / time" value={query.window} options={WINDOWS.map(([value, label]) => ({ value, label, href: href({ window: value }) }))} />
          <Filter
            label="Match type"
            value={query.mode}
            options={[
              { value: 'all', label: 'Ranked + unranked', href: href({ mode: 'all' }) },
              { value: 'ranked', label: 'Ranked only', href: href({ mode: 'ranked' }) },
            ]}
          />
        </div>
      </div>
      <Filter label="Rank (match average)" value={query.rank} options={rankBandOptions(rankLabels, ranks, (rank) => href({ rank }))} />
      <div className="grid gap-5 md:grid-cols-2">
        {slot && (
          <Filter
            label="Item slot"
            value={slot.value}
            options={[{ value: 'all', label: 'All', href: slot.href('all') }, ...SLOTS.map((s) => ({ value: s, label: capitalize(s), href: slot.href(s) }))]}
          />
        )}
        <div className="flex flex-col gap-2">
          <span className="text-eyebrow">Game mode</span>
          <p className="text-sm text-text-muted">Normal (6v6). Street Brawl is played in rounds, so purchase minutes don’t apply to it.</p>
        </div>
      </div>
    </div>
  )
}
