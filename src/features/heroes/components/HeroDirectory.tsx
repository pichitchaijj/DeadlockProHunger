'use client'

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Reveal } from '@/components/motion/Reveal'
import { Button } from '@/components/ui/Button'
import { Filter } from '@/components/ui/Filter'
import { ChevronDownIcon, FilterIcon } from '@/components/ui/icons'
import { SearchInput } from '@/components/ui/SearchInput'
import { EmptyState } from '@/components/ui/States'
import { RANK_BANDS, type RankBandId } from '@/lib/analytics/rankBands'
import { cx } from '@/lib/cx'
import { capitalize } from '@/features/meta/model'
import { ROLES, type MetaWindow } from '@/features/meta/query'
import { filterHeroes } from '../filter'
import type { DirectoryHero } from '../loaders'
import { DEFAULT_VIEW, heroesHref, SORTS, type DirectoryScope, type DirectorySort, type DirectoryView } from '../query'
import { ComplexityDots, HeroDirectoryCard } from './HeroDirectoryCard'

type HeroDirectoryProps = {
  heroes: DirectoryHero[]
  scope: DirectoryScope
  initialView: DirectoryView
  windowLabels: Record<MetaWindow, string>
  rankLabels: Record<RankBandId, string>
}

const WINDOWS: Array<[MetaWindow, string]> = [
  ['patch', 'Current patch'],
  ['7d', '7 days'],
  ['30d', '30 days'],
]

/**
 * Instant hero discovery. Scope (patch/rank) reloads data via links; search, role,
 * complexity and sort filter in the browser and are mirrored into the URL.
 * "/" focuses the search field.
 */
export function HeroDirectory({ heroes, scope, initialView, windowLabels, rankLabels }: HeroDirectoryProps) {
  const [view, setView] = useState(initialView)
  const resultsId = useId()
  const searchWrap = useRef<HTMLDivElement>(null)
  const visible = useMemo(() => filterHeroes(heroes, view), [heroes, view])
  const update = (changes: Partial<DirectoryView>) => setView((v) => ({ ...v, ...changes }))
  const filtered = view.q !== '' || view.role !== 'all' || view.complexity !== null
  // Mobile progressive disclosure: secondary filters fold away below md.
  const [moreOpen, setMoreOpen] = useState(false)
  const moreId = useId()
  const moreActive = (view.complexity !== null ? 1 : 0) + (scope.window !== '7d' ? 1 : 0) + (scope.rank !== 'all' ? 1 : 0)
  const secondary = cx(!moreOpen && 'max-md:hidden')

  // Keep the URL shareable without a server round trip.
  useEffect(() => {
    window.history.replaceState(window.history.state, '', heroesHref(scope, view))
  }, [scope, view])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (event.key !== '/' || target.closest('input, textarea, select, [contenteditable]')) return
      event.preventDefault()
      searchWrap.current?.querySelector('input')?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-5 rounded-md border border-border bg-surface/60 p-(--spacing-card)">
        <div className="grid gap-5 lg:grid-cols-[minmax(16rem,1fr)_auto]">
          <div ref={searchWrap}>
            <SearchInput
              label="Search heroes"
              placeholder="Hero name or role"
              hint="Press / to search from anywhere on this page."
              value={view.q}
              onChange={(event) => update({ q: event.target.value })}
              onClear={() => update({ q: '' })}
              aria-controls={resultsId}
            />
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-eyebrow">Sort by</span>
            <select
              value={view.sort}
              onChange={(event) => update({ sort: event.target.value as DirectorySort })}
              className="h-11 rounded-sm border border-border-control bg-surface-sunken px-3 font-ui text-sm text-text hover:border-text-muted focus-visible:border-primary"
            >
              {SORTS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <ToggleGroup
            label="Role"
            options={[{ value: 'all', label: 'All' }, ...ROLES.map((role) => ({ value: role, label: capitalize(role) }))]}
            value={view.role}
            onChange={(role) => update({ role: role as DirectoryView['role'] })}
          />
          <div id={moreId} className={secondary}>
          <ToggleGroup
            label="Category: complexity (game rating)"
            options={[
              { value: 'all', label: 'All' },
              ...[1, 2, 3, 4].map((n) => ({ value: String(n), label: <><ComplexityDots value={n} /><span aria-hidden="true">{n}</span></> })),
            ]}
            value={view.complexity === null ? 'all' : String(view.complexity)}
            onChange={(value) => update({ complexity: value === 'all' ? null : Number(value) })}
          />
          </div>
        </div>

        <button
          type="button"
          aria-expanded={moreOpen}
          aria-controls={`${moreId} ${moreId}-scope`}
          onClick={() => setMoreOpen((open) => !open)}
          className="inline-flex h-11 items-center gap-2 self-start font-ui text-sm font-semibold text-text-muted hover:text-text md:hidden"
        >
          <FilterIcon size={18} />
          {moreOpen ? 'Fewer filters' : 'More filters'}
          {moreActive > 0 && <span className="rounded-pill bg-primary/20 px-2 text-caption text-text tabular">{moreActive} active</span>}
          <ChevronDownIcon size={16} className={cx('transition-transform duration-(--dur-fast)', moreOpen && 'rotate-180')} />
        </button>

        <div id={`${moreId}-scope`} className={cx('grid gap-5 border-t border-border pt-5 md:grid-cols-2', secondary)}>
          <Filter
            label="Patch / time"
            value={scope.window}
            options={WINDOWS.map(([value, label]) => ({ value, label, href: heroesHref({ ...scope, window: value }, view) }))}
          />
          <Filter
            label="Rank (match average)"
            value={scope.rank}
            options={RANK_BANDS.map((band) => ({ value: band.id, label: rankLabels[band.id], href: heroesHref({ ...scope, rank: band.id }, view) }))}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" aria-live="polite" className="text-sm text-text-muted">
          Showing <span className="font-semibold text-text tabular">{visible.length}</span> of {heroes.length} heroes ·{' '}
          {windowLabels[scope.window]}, {rankLabels[scope.rank]}
        </p>
        {filtered && (
          <Button variant="ghost" size="sm" onClick={() => setView({ ...DEFAULT_VIEW, sort: view.sort })}>
            Clear filters
          </Button>
        )}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="No heroes match"
          description="Try a different name, or clear the role and complexity filters."
          action={<Button variant="secondary" size="sm" onClick={() => setView({ ...DEFAULT_VIEW, sort: view.sort })}>Clear filters</Button>}
        />
      ) : (
        <ul id={resultsId} aria-label="Heroes" className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 md:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5">
          {visible.map((hero, i) => (
            <Reveal as="li" key={hero.slug} index={i}>
              <HeroDirectoryCard hero={hero} index={i} />
            </Reveal>
          ))}
        </ul>
      )}
    </div>
  )
}

type ToggleOption = { value: string; label: ReactNode }

/** Single-select button group (aria-pressed). Instant, no navigation. */
function ToggleGroup({ label, options, value, onChange }: { label: string; options: ToggleOption[]; value: string; onChange: (value: string) => void }) {
  const labelId = useId()
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-2">
      <span id={labelId} className="text-eyebrow">
        {label}
      </span>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 md:flex-wrap md:overflow-visible">
        {options.map((option) => {
          const active = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={cx(
                'inline-flex h-9 shrink-0 items-center gap-2 rounded-pill border px-3.5 font-ui text-sm whitespace-nowrap pointer-coarse:h-11',
                'transition-[background-color,border-color,color] duration-(--dur-fast) ease-awaken',
                active ? 'border-primary bg-primary font-medium text-on-primary' : 'border-border-control text-text-muted hover:border-text-muted hover:text-text',
              )}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
