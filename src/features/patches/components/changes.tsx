import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
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
import { changeId, propertyText, valueText, type PatchTranslate } from '../text'
import { BeforeAfter, DirectionBadge, PointDelta, RateChange, VerdictBadge } from './indicators'

/** Layer 1: how much changed, at a glance. `source`: where the counts come from (game-data diff or official notes). */
export function ChangeSummary({ counts, source }: { counts: ChangeCounts; source: 'game' | 'notes' }) {
  const t = useTranslations('patch.changes.summary')
  const cells: Array<['heroes' | 'abilities' | 'items', number]> = [
    ['heroes', counts.heroes],
    ['abilities', counts.abilities],
    ['items', counts.items],
  ]
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border bg-border">
        {cells.map(([id, n]) => (
          <div key={id} className="bg-surface px-4 py-3">
            <dt className="text-eyebrow">{t(id)}</dt>
            <dd className="font-display text-display-m font-bold text-text tabular">{n}</dd>
          </div>
        ))}
      </dl>
      <p className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
        <DirectionBadge mark="buff" /> {counts.buffs}
        <DirectionBadge mark="nerf" className="ml-2" /> {counts.nerfs}
        <DirectionBadge mark="changed" className="ml-2" /> {counts.changed}
        <span className="ml-2">{t('values', { source })}</span>
      </p>
    </div>
  )
}

/** The words for an entity's own label: hero base stats and the gun are this site's labels; abilities keep the game's name. */
const PART_KEY: Partial<Record<EntityChange['kind'], 'baseStats' | 'gun'>> = { hero: 'baseStats', weapon: 'gun' }

/** One card per hero: base stats, gun and abilities, each value Before → After with its marker. */
export function HeroChangeCards({ heroes, refs }: { heroes: HeroChanges[]; refs: Map<number, HeroRef> }) {
  const t = useTranslations('patch.changes')
  return (
    <ol className="grid gap-3 lg:grid-cols-2">
      {heroes.map((h) => {
        const ref = refs.get(h.heroId)
        const name = h.name ?? t('unnamedHero', { id: h.heroId })
        return (
          <li key={h.heroId} className={cx(cardClasses({}), 'flex flex-col gap-3 p-4')}>
            <header className="flex items-center gap-3">
              <HeroPortrait name={name} src={ref?.iconUrl ?? undefined} size="sm" decorative />
              {ref ? (
                <Link href={`/heroes/${ref.slug}`} className="inline-flex items-center font-ui text-title font-semibold text-text hover:text-highlight pointer-coarse:min-h-11 pointer-coarse:min-w-11">
                  {name}
                </Link>
              ) : (
                <span className="font-ui text-title font-semibold text-text">{name}</span>
              )}
              <DirectionBadge mark={h.status === 'changed' ? h.direction : h.status} className="ml-auto" />
            </header>
            {h.status !== 'changed' && h.parts.length === 0 && (
              <p className="text-sm text-text-muted">{h.status === 'new' ? t('newHero') : t('removedHero')}</p>
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
  const t = useTranslations('patch.changes')
  const key = PART_KEY[part.kind]
  return (
    <div className="border-t border-border pt-2">
      <h4 className="mb-1 flex items-center gap-2 font-ui text-sm font-semibold text-text">
        {key ? t(key) : part.name}
        {part.status !== 'changed' && <DirectionBadge mark={part.status} />}
      </h4>
      <ChangeRows changes={part.changes} />
    </div>
  )
}

function ChangeRows({ changes }: { changes: EntityChange['changes'] }) {
  const t = useTranslations('patch')
  const tr: PatchTranslate = (key, values) => t(key as 'untitled', values)
  if (changes.length === 0) return null
  return (
    <ul className="flex flex-col gap-1">
      {changes.map((c, i) => (
        <li key={`${changeId(c)}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="min-w-0 flex-1 text-text-muted">{propertyText(c.property, tr)}</span>
          <BeforeAfter before={valueText(c.before, c.unit, tr)} after={valueText(c.after, c.unit, tr)} />
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
  const t = useTranslations('patch.changes')
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
                <span className="block text-caption text-text-muted">{[item.slot && capitalize(item.slot), ref?.tier && t('itemTier', { tier: ref.tier })].filter(Boolean).join(' · ')}</span>
              </span>
              <DirectionBadge mark={item.status === 'changed' ? item.direction : item.status} className="ml-auto" />
            </header>
            <ChangeRows changes={item.changes} />
            {s && (
              <dl className="grid grid-cols-2 gap-3 border-t border-border pt-2 text-sm">
                <div>
                  <dt className="text-caption text-text-muted">{t('winRate')}</dt>
                  <dd className="flex flex-wrap items-center gap-2">
                    <RateChange before={s.before?.winRate ?? null} after={s.after?.winRate ?? null} />
                    <PointDelta delta={s.winDelta} muted={s.verdict !== 'higher' && s.verdict !== 'lower'} />
                  </dd>
                  <dd className="mt-1">
                    <VerdictBadge verdict={s.verdict} />
                  </dd>
                </div>
                <div>
                  <dt className="text-caption text-text-muted">{t('buyRate')}</dt>
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
  const t = useTranslations('patch.changes')
  // Keyed by the notes' own section header (data); lines outside any section share one group, worded at render.
  const sections = new Map<string | null, NoteLine[]>()
  for (const l of lines) sections.set(l.section, [...(sections.get(l.section) ?? []), l])
  return (
    <div className="flex flex-col gap-5">
      {[...sections].map(([section, list]) => (
        <section key={section ?? ' general'} className="flex flex-col gap-2">
          <h4 className="text-eyebrow">{section ?? t('notesGeneral')}</h4>
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
  const t = useTranslations('patch')
  const tr: PatchTranslate = (key, values) => t(key as 'untitled', values)
  if (list.length === 0) return null
  return (
    <details className="rounded-md border border-border bg-surface-sunken px-4 py-2">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-ui text-sm font-semibold text-primary hover:text-highlight">
        {t('changes.broad.summary', { count: list.length })}
      </summary>
      <p className="mt-1 text-caption text-text-muted">{t('changes.broad.explanation')}</p>
      <ul className="mt-2 flex flex-col gap-1 pb-2">
        {list.map((c) => (
          <li key={changeId(c)} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="min-w-0 flex-1 text-text-muted">{propertyText(c.property, tr)}</span>
            <BeforeAfter before={valueText(c.before, c.unit, tr)} after={valueText(c.after, c.unit, tr)} />
            <span className="text-caption text-text-muted tabular">{t('changes.broad.entries', { count: c.count })}</span>
            <DirectionBadge mark={c.direction} />
          </li>
        ))}
      </ul>
    </details>
  )
}
