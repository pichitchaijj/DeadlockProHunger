import Link from 'next/link'
import { HeroPortrait } from '@/components/game-assets/HeroPortrait'
import { ItemIcon } from '@/components/game-assets/ItemIcon'
import { cardClasses } from '@/components/ui/Card'
import { cx } from '@/lib/cx'
import type { HeroRef, ItemRef } from '@/features/items/model'
import { capitalize } from '@/features/meta/model'
import type { BroadChange, EntityChange } from '../diff'
import type { ChangeCounts, HeroChanges } from '../model'
import type { NoteLine } from '../notes'
import type { ItemMovement } from '../loaders'
import { BeforeAfter, DirectionBadge, PointDelta, RateChange, VerdictBadge } from './indicators'

/** Layer 1: how much changed, at a glance. */
export function ChangeSummary({ counts, source }: { counts: ChangeCounts; source: string }) {
  const cells: Array<[string, number]> = [
    ['Heroes changed', counts.heroes],
    ['Abilities changed', counts.abilities],
    ['Items changed', counts.items],
  ]
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border bg-border">
        {cells.map(([label, n]) => (
          <div key={label} className="bg-surface px-4 py-3">
            <dt className="text-eyebrow">{label}</dt>
            <dd className="font-display text-display-m font-bold text-text tabular">{n}</dd>
          </div>
        ))}
      </dl>
      <p className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
        <DirectionBadge mark="buff" /> {counts.buffs}
        <DirectionBadge mark="nerf" className="ml-2" /> {counts.nerfs}
        <DirectionBadge mark="changed" className="ml-2" /> {counts.changed}
        <span className="ml-2">value changes · {source}</span>
      </p>
    </div>
  )
}

const PART_LABEL: Record<EntityChange['kind'], string> = { hero: 'Base stats', weapon: 'Gun', ability: '', item: '' }

/** One card per hero: base stats, gun and abilities, each value Before → After with its marker. */
export function HeroChangeCards({ heroes, refs }: { heroes: HeroChanges[]; refs: Map<number, HeroRef> }) {
  return (
    <ol className="grid gap-3 lg:grid-cols-2">
      {heroes.map((h) => {
        const ref = refs.get(h.heroId)
        return (
          <li key={h.heroId} className={cx(cardClasses({}), 'flex flex-col gap-3 p-4')}>
            <header className="flex items-center gap-3">
              <HeroPortrait name={h.name} src={ref?.iconUrl ?? undefined} size="sm" decorative />
              {ref ? (
                <Link href={`/heroes/${ref.slug}`} className="inline-flex items-center font-ui text-title font-semibold text-text hover:text-highlight pointer-coarse:min-h-11 pointer-coarse:min-w-11">
                  {h.name}
                </Link>
              ) : (
                <span className="font-ui text-title font-semibold text-text">{h.name}</span>
              )}
              <DirectionBadge mark={h.status === 'changed' ? h.direction : h.status} className="ml-auto" />
            </header>
            {h.status !== 'changed' && h.parts.length === 0 && (
              <p className="text-sm text-text-muted">{h.status === 'new' ? 'New playable hero in this build.' : 'No longer playable in this build.'}</p>
            )}
            {h.parts.map((part) => (
              <PartRows key={part.key} part={part} />
            ))}
          </li>
        )
      })}
    </ol>
  )
}

function PartRows({ part }: { part: EntityChange }) {
  return (
    <div className="border-t border-border pt-2">
      <h4 className="mb-1 flex items-center gap-2 font-ui text-sm font-semibold text-text">
        {PART_LABEL[part.kind] || part.name}
        {part.status !== 'changed' && <DirectionBadge mark={part.status} />}
      </h4>
      <ChangeRows changes={part.changes} />
    </div>
  )
}

function ChangeRows({ changes }: { changes: EntityChange['changes'] }) {
  if (changes.length === 0) return null
  return (
    <ul className="flex flex-col gap-1">
      {changes.map((c, i) => (
        <li key={`${c.property}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="min-w-0 flex-1 text-text-muted">{c.property}</span>
          <BeforeAfter before={c.before} after={c.after} />
          <DirectionBadge mark={c.direction} />
        </li>
      ))}
    </ul>
  )
}

/**
 * Changed shop items: value changes Before → After, and win / buy rate before → after the patch
 * when the statistics loaded.
 */
export function ItemChangeCards({ items, refs, stats }: { items: EntityChange[]; refs: Map<number, ItemRef>; stats: Map<number, ItemMovement> | null }) {
  return (
    <ol className="grid gap-3 lg:grid-cols-2">
      {items.map((item) => {
        const ref = refs.get(item.id)
        const s = stats?.get(item.id)
        return (
          <li key={item.key} className={cx(cardClasses({}), 'flex flex-col gap-3 p-4')}>
            <header className="flex items-center gap-3">
              <ItemIcon name={item.name} src={ref?.icon ?? null} slot={item.slot} tier={ref?.tier ?? null} size={32} decorative />
              <span className="min-w-0">
                {ref ? (
                  <Link href={`/items/${ref.slug}`} className="flex items-center truncate font-ui text-title font-semibold text-text hover:text-highlight pointer-coarse:min-h-11">
                    {item.name}
                  </Link>
                ) : (
                  <span className="block truncate font-ui text-title font-semibold text-text">{item.name}</span>
                )}
                <span className="block text-caption text-text-muted">{[item.slot && capitalize(item.slot), ref?.tier && `Tier ${ref.tier}`].filter(Boolean).join(' · ')}</span>
              </span>
              <DirectionBadge mark={item.status === 'changed' ? item.direction : item.status} className="ml-auto" />
            </header>
            <ChangeRows changes={item.changes} />
            {s && (
              <dl className="grid grid-cols-2 gap-3 border-t border-border pt-2 text-sm">
                <div>
                  <dt className="text-caption text-text-muted">Win rate (before → after)</dt>
                  <dd className="flex flex-wrap items-center gap-2">
                    <RateChange before={s.before?.winRate ?? null} after={s.after?.winRate ?? null} />
                    <PointDelta delta={s.winDelta} muted={s.verdict !== 'higher' && s.verdict !== 'lower'} />
                  </dd>
                  <dd className="mt-1">
                    <VerdictBadge verdict={s.verdict} />
                  </dd>
                </div>
                <div>
                  <dt className="text-caption text-text-muted">Buy rate (before → after)</dt>
                  <dd>
                    <RateChange before={s.rateBefore} after={s.rateAfter} />
                  </dd>
                </div>
              </dl>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** The official notes, by section. A before → after is shown only when the line states "from X to Y". */
export function OfficialNotes({ lines }: { lines: NoteLine[] }) {
  const sections = new Map<string, NoteLine[]>()
  for (const l of lines) {
    const key = l.section ?? 'Changes'
    sections.set(key, [...(sections.get(key) ?? []), l])
  }
  return (
    <div className="flex flex-col gap-5">
      {[...sections].map(([section, list]) => (
        <section key={section} className="flex flex-col gap-2">
          <h4 className="text-eyebrow">{section}</h4>
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border bg-surface">
            {list.map((l, i) => (
              <li key={i} className="flex flex-col gap-1.5 px-3 py-2 text-sm sm:flex-row sm:items-start sm:gap-3">
                <span className="min-w-0 flex-1 text-text">{l.text}</span>
                {l.before && l.after && (
                  <span className="flex shrink-0 flex-wrap items-center gap-2">
                    <BeforeAfter before={l.before} after={l.after} />
                    <DirectionBadge mark={l.direction} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/**
 * Identical changes found on many entries at once (a global rule or a change in how the game files store a
 * value). Listed once with a count instead of on every ability or item.
 */
export function BroadChanges({ list }: { list: BroadChange[] }) {
  if (list.length === 0) return null
  return (
    <details className="rounded-md border border-border bg-surface-sunken px-4 py-2">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-ui text-sm font-semibold text-primary hover:text-highlight">
        Broad changes ({list.length}): the same value change on many entries
      </summary>
      <p className="mt-1 text-caption text-text-muted">
        A global rule or a change in how the game files store a value. Shown once here instead of on every ability or item.
      </p>
      <ul className="mt-2 flex flex-col gap-1 pb-2">
        {list.map((c) => (
          <li key={`${c.property}|${c.before}|${c.after}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="min-w-0 flex-1 text-text-muted">{c.property}</span>
            <BeforeAfter before={c.before} after={c.after} />
            <span className="text-caption text-text-muted tabular">on {c.count} entries</span>
            <DirectionBadge mark={c.direction} />
          </li>
        ))}
      </ul>
    </details>
  )
}
