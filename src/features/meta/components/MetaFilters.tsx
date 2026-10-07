import { Link } from '@/i18n/navigation'
import { Filter } from '@/components/ui/Filter'
import { ChevronDownIcon, FilterIcon } from '@/components/ui/icons'
import type { RankBandId } from '@/lib/analytics/rankBands'
import type { RankCatalog } from '@/lib/deadlock/rankAssets'
import { formatPercent } from '@/lib/format'
import { capitalize } from '../model'
import { rankBandOptions } from '../rankFilter'
import { DEFAULT_QUERY, metaHref, ROLES, type MetaQuery, type MetaWindow } from '../query'

type MetaFiltersProps = {
  query: MetaQuery
  windowLabels: Record<MetaWindow, string>
  rankLabels: Record<RankBandId, string>
  ranks: RankCatalog
  rankShares: Record<RankBandId, number> | null
}

const WINDOW_SHORT: Record<MetaWindow, string> = { patch: 'Current patch', '7d': '7 days', '30d': '30 days' }

/** Primary filters always visible; advanced filters behind a disclosure. All state is in the URL. */
export function MetaFilters({ query, windowLabels, rankLabels, ranks, rankShares }: MetaFiltersProps) {
  const advancedActive = query.mode !== DEFAULT_QUERY.mode || query.showLow
  const share = rankShares && query.rank !== 'all' ? rankShares[query.rank] : null

  return (
    <div className="flex flex-col gap-5 rounded-md border border-border bg-surface/60 p-(--spacing-card)">
      <div className="grid gap-5 md:grid-cols-2">
        <Filter
          label="Patch / time"
          value={query.window}
          options={(['patch', '7d', '30d'] as const).map((w) => ({
            value: w,
            label: WINDOW_SHORT[w],
            href: metaHref(query, { window: w }),
          }))}
        />
        <div className="flex min-w-0 flex-col gap-1.5 md:order-last md:col-span-2">
          <Filter
            label="Rank (match average)"
            value={query.rank}
            options={rankBandOptions(rankLabels, ranks, (rank) => metaHref(query, { rank }))}
          />
          {share !== null && (
            <p className="text-caption text-text-muted">
              About {formatPercent(share, 0)} of ranked players are in this band (latest ranked match, last 30 days).
            </p>
          )}
        </div>
        <Filter
          label="Role"
          value={query.role}
          options={[
            { value: 'all', label: 'All', href: metaHref(query, { role: 'all' }) },
            ...ROLES.map((role) => ({ value: role, label: capitalize(role), href: metaHref(query, { role }) })),
          ]}
        />
      </div>

      <details className="group border-t border-border pt-4" open={advancedActive}>
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 font-ui text-sm font-semibold text-text-muted hover:text-text [&::-webkit-details-marker]:hidden">
          <FilterIcon size={18} />
          Advanced filters
          {advancedActive && <span className="size-1.5 rounded-pill bg-primary" aria-label="(active)" />}
          <ChevronDownIcon size={16} className="transition-transform duration-(--dur-fast) group-open:rotate-180" />
        </summary>

        <div className="mt-4 grid gap-5 animate-awaken md:grid-cols-2 xl:grid-cols-4">
          <Filter
            label="Match type"
            value={query.mode}
            options={[
              { value: 'all', label: 'Ranked + unranked', href: metaHref(query, { mode: 'all' }) },
              { value: 'ranked', label: 'Ranked only', href: metaHref(query, { mode: 'ranked' }) },
            ]}
          />
          <Filter
            label="Low-sample heroes"
            value={query.showLow ? 'show' : 'hide'}
            options={[
              { value: 'hide', label: 'Hide (< 200 matches)', href: metaHref(query, { showLow: false }) },
              { value: 'show', label: 'Show, muted', href: metaHref(query, { showLow: true }) },
            ]}
          />
          <div className="flex flex-col gap-2">
            <span className="text-eyebrow">Region</span>
            <p className="text-sm text-text-muted">Not available: the hero statistics source has no region filter.</p>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-eyebrow">Game mode</span>
            <p className="text-sm text-text-muted">Normal (6v6). Street Brawl comes later.</p>
          </div>
        </div>
      </details>

      <p className="flex flex-wrap items-center justify-between gap-2 text-caption text-text-muted">
        <span>
          Showing <span className="text-text">{windowLabels[query.window]}</span>
        </span>
        {metaHref(query) !== '/meta' && (
          <Link href="/meta" className="font-semibold text-primary hover:text-highlight">
            Reset filters
          </Link>
        )}
      </p>
    </div>
  )
}
