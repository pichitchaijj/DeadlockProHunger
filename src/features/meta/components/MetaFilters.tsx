import { useLocale, useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Filter } from '@/components/ui/Filter'
import { ChevronDownIcon, FilterIcon } from '@/components/ui/icons'
import type { Locale } from '@/i18n/config'
import type { RankBandId } from '@/lib/analytics/rankBands'
import { SAMPLE_TIER_THRESHOLDS } from '@/lib/analytics/sampleTier'
import type { RankCatalog } from '@/lib/deadlock/rankAssets'
import { formatInteger, formatPercent } from '@/lib/format'
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

/** Primary filters always visible; advanced filters behind a disclosure. All state is in the URL. */
export function MetaFilters({ query, windowLabels, rankLabels, ranks, rankShares }: MetaFiltersProps) {
  const advancedActive = query.mode !== DEFAULT_QUERY.mode || query.showLow
  const share = rankShares && query.rank !== 'all' ? rankShares[query.rank] : null
  const t = useTranslations('meta.filters')
  const list = useTranslations('heroes.list')
  const locale = useLocale() as Locale

  return (
    <div className="flex flex-col gap-5 rounded-md border border-border bg-surface/60 p-(--spacing-card)">
      <div className="grid gap-5 md:grid-cols-2">
        <Filter
          label={list('window')}
          value={query.window}
          options={(['patch', '7d', '30d'] as const).map((w) => ({
            value: w,
            label: list(`windows.${w}`),
            href: metaHref(query, { window: w }),
          }))}
        />
        <div className="flex min-w-0 flex-col gap-1.5 md:order-last md:col-span-2">
          <Filter
            label={list('rank')}
            value={query.rank}
            options={rankBandOptions(rankLabels, ranks, (rank) => metaHref(query, { rank }))}
          />
          {share !== null && (
            <p className="text-caption text-text-muted">
              {t('share', { share: formatPercent(share, 0) })}
            </p>
          )}
        </div>
        <Filter
          label={list('role')}
          value={query.role}
          options={[
            { value: 'all', label: list('all'), href: metaHref(query, { role: 'all' }) },
            ...ROLES.map((role) => ({ value: role, label: capitalize(role), href: metaHref(query, { role }) })),
          ]}
        />
      </div>

      <details className="group border-t border-border pt-4" open={advancedActive}>
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 font-ui text-sm font-semibold text-text-muted hover:text-text [&::-webkit-details-marker]:hidden">
          <FilterIcon size={18} />
          {t('advanced')}
          {advancedActive && <span className="size-1.5 rounded-pill bg-primary" aria-label={t('active')} />}
          <ChevronDownIcon size={16} className="transition-transform duration-(--dur-fast) group-open:rotate-180" />
        </summary>

        <div className="mt-4 grid gap-5 animate-awaken md:grid-cols-2 xl:grid-cols-4">
          <Filter
            label={t('matchType')}
            value={query.mode}
            options={[
              { value: 'all', label: t('rankedAndUnranked'), href: metaHref(query, { mode: 'all' }) },
              { value: 'ranked', label: t('rankedOnly'), href: metaHref(query, { mode: 'ranked' }) },
            ]}
          />
          <Filter
            label={t('lowSample')}
            value={query.showLow ? 'show' : 'hide'}
            options={[
              { value: 'hide', label: t('hide', { threshold: formatInteger(SAMPLE_TIER_THRESHOLDS.moderate, locale) }), href: metaHref(query, { showLow: false }) },
              { value: 'show', label: t('show'), href: metaHref(query, { showLow: true }) },
            ]}
          />
          <div className="flex flex-col gap-2">
            <span className="text-eyebrow">{t('region')}</span>
            <p className="text-sm text-text-muted">{t('regionNote')}</p>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-eyebrow">{t('gameMode')}</span>
            <p className="text-sm text-text-muted">{t('gameModeNote')}</p>
          </div>
        </div>
      </details>

      <p className="flex flex-wrap items-center justify-between gap-2 text-caption text-text-muted">
        <span>{t.rich('showing', { window: windowLabels[query.window], b: (chunks) => <span className="text-text">{chunks}</span> })}</span>
        {metaHref(query) !== '/meta' && (
          <Link href="/meta" className="font-semibold text-primary hover:text-highlight">
            {t('reset')}
          </Link>
        )}
      </p>
    </div>
  )
}
