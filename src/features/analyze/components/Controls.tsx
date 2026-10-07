import { Link } from '@/i18n/navigation'
import { HeroPortrait } from '@/components/game-assets/HeroPortrait'
import { Card } from '@/components/ui/Card'
import { Filter } from '@/components/ui/Filter'
import type { RankBandId } from '@/lib/analytics/rankBands'
import type { RankCatalog } from '@/lib/deadlock/rankAssets'
import { cx } from '@/lib/cx'
import { capitalize } from '@/features/meta/model'
import { ROLES, type MetaWindow } from '@/features/meta/query'
import { rankBandOptions } from '@/features/meta/rankFilter'
import { pickerHeroes, type PickerHero } from '../model'
import { analyzeHref, type AnalyzeQuery } from '../query'

const WINDOWS = [
  ['patch', 'Current patch'],
  ['7d', '7 days'],
  ['30d', '30 days'],
] as const

type ControlsProps = {
  query: AnalyzeQuery
  heroes: PickerHero[]
  rankLabels: Record<RankBandId, string>
  ranks: RankCatalog
  windowLabels: Record<MetaWindow, string>
  /** Name of the hero under analysis, when one is selected and known. */
  selectedName: string | null
}

/**
 * Scope and hero selection. Everything is a link (state lives in the URL, no client JS). Once a hero
 * is selected the picker folds into "Change hero" so the analysis leads.
 */
export function Controls({ query, heroes, rankLabels, ranks, windowLabels, selectedName }: ControlsProps) {
  const picker = <HeroPicker query={query} heroes={heroes} />
  return (
    <Card as="section" aria-labelledby="analyze-scope" className="flex flex-col gap-5 p-(--spacing-card)">
      <h2 id="analyze-scope" className="sr-only">
        Analysis scope
      </h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Filter
          label="Patch / time"
          value={query.window}
          options={WINDOWS.map(([value]) => ({ value, label: windowLabels[value] ?? value, href: analyzeHref(query, { window: value }) }))}
        />
        <Filter
          label="Rank (match average)"
          value={query.rank}
          options={rankBandOptions(rankLabels, ranks, (rank) => analyzeHref(query, { rank }))}
        />
      </div>
      {selectedName ? (
        <details className="group border-t border-border pt-4">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-ui text-sm font-semibold text-primary hover:text-highlight [&::-webkit-details-marker]:hidden">
            <span aria-hidden="true" className="transition-transform group-open:rotate-90">
              ›
            </span>
            Change hero <span className="font-normal text-text-muted">(analyzing {selectedName})</span>
          </summary>
          <div className="mt-4">{picker}</div>
        </details>
      ) : (
        <div className="border-t border-border pt-4">{picker}</div>
      )}
    </Card>
  )
}

function HeroPicker({ query, heroes }: { query: AnalyzeQuery; heroes: PickerHero[] }) {
  const list = pickerHeroes(heroes, query.role)
  return (
    <div className="flex flex-col gap-4">
      <Filter
        label="Role"
        value={query.role}
        options={[{ value: 'all', label: 'All roles' }, ...ROLES.map((r) => ({ value: r, label: capitalize(r) }))].map((o) => ({
          ...o,
          href: analyzeHref(query, { role: o.value as AnalyzeQuery['role'] }),
        }))}
      />
      <nav aria-label="Choose a hero to analyze">
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {list.map((h) => {
            const selected = h.slug === query.hero
            return (
              <li key={h.id}>
                <Link
                  href={analyzeHref(query, { hero: h.slug })}
                  aria-current={selected ? 'true' : undefined}
                  className={cx(
                    'flex min-h-11 items-center gap-2.5 rounded-sm border px-2 py-1.5 transition-colors duration-(--dur-fast)',
                    selected ? 'border-primary bg-surface-raised text-text' : 'border-border bg-surface-sunken text-text-muted hover:border-border-control hover:text-text',
                  )}
                >
                  <HeroPortrait name={h.name} src={h.iconUrl ?? undefined} size="sm" decorative />
                  <span className="min-w-0 truncate font-ui text-sm font-semibold">{h.name}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
