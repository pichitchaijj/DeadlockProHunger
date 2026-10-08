import { useTranslations } from 'next-intl'
import { Filter } from '@/components/ui/Filter'
import type { RankBandId } from '@/lib/analytics/rankBands'
import type { RankCatalog } from '@/lib/deadlock/rankAssets'
import { HeroSelect } from '@/features/builds/components/HeroSelect'
import { capitalize } from '@/features/meta/model'
import type { MetaWindow } from '@/features/meta/query'
import { rankBandOptions } from '@/features/meta/rankFilter'
import { SLOTS, type ItemScopeQuery, type ItemSlot } from '../query'

const WINDOWS: MetaWindow[] = ['patch', '7d', '30d']

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
 * All state is in the URL (links; only the hero select navigates with JS). Items pages only; the shared
 * hero select gets its labels from here. Window, rank and hero labels reuse the Builds catalog wording.
 */
export function ItemFilters({ query, href, heroes, rankLabels, ranks, slot }: ItemFiltersProps) {
  const t = useTranslations('items.filters')
  const shared = useTranslations('builds.list')
  return (
    <div className="flex flex-col gap-5 rounded-md border border-border bg-surface/60 p-(--spacing-card)">
      <div className="grid gap-5 md:grid-cols-[16rem_1fr]">
        <HeroSelect
          heroes={heroes}
          value={query.hero}
          hrefFor={Object.fromEntries([['all', href({ hero: 'all' })], ...heroes.map((h) => [h.slug, href({ hero: h.slug })])])}
          label={shared('hero')}
          allLabel={shared('allHeroes')}
        />
        <div className="grid gap-5 lg:grid-cols-2">
          <Filter label={t('window')} value={query.window} options={WINDOWS.map((value) => ({ value, label: shared(`windows.${value}`), href: href({ window: value }) }))} />
          <Filter
            label={t('matchType')}
            value={query.mode}
            options={[
              { value: 'all', label: t('modeAll'), href: href({ mode: 'all' }) },
              { value: 'ranked', label: t('modeRanked'), href: href({ mode: 'ranked' }) },
            ]}
          />
        </div>
      </div>
      <Filter label={shared('rank')} value={query.rank} options={rankBandOptions(rankLabels, ranks, (rank) => href({ rank }))} />
      <div className="grid gap-5 md:grid-cols-2">
        {slot && (
          <Filter
            label={t('slot')}
            value={slot.value}
            // Slot names (weapon / vitality / spirit) are the game's item categories: data, not UI text.
            options={[{ value: 'all', label: t('allSlots'), href: slot.href('all') }, ...SLOTS.map((s) => ({ value: s, label: capitalize(s), href: slot.href(s) }))]}
          />
        )}
        <div className="flex flex-col gap-2">
          <span className="text-eyebrow">{t('gameMode')}</span>
          <p className="text-sm text-text-muted">{t('gameModeNote')}</p>
        </div>
      </div>
    </div>
  )
}
